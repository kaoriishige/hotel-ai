const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

let getDb = null;
let admin = null;
try {
  const fb = require('./_lib-endo/firebase-admin');
  getDb = fb.getDb;
  admin = fb.admin;
} catch (e1) {
  try {
    const fb = require('./_lib/firebase-admin');
    getDb = fb.getDb;
    admin = fb.admin;
  } catch (e2) {}
}

function getSesClient() {
  const accessKeyId = (process.env.SES_ACCESS_KEY || '').trim();
  const secretAccessKey = (process.env.SES_SECRET_KEY || '').trim();
  const region = (process.env.SES_REGION || 'ap-northeast-1').trim();

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  return new SESClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { payloads, customers, channel, scenario, customSubject, customMessage, scheduleTitle } = body;

    let targetList = [];
    if (Array.isArray(customers) && customers.length > 0) {
      targetList = customers;
    } else if (Array.isArray(payloads) && payloads.length > 0) {
      targetList = payloads;
    } else {
      return json(400, { ok: false, error: 'customers or payloads array is required' });
    }

    const hasAwsCreds = !!(process.env.SES_ACCESS_KEY && process.env.SES_SECRET_KEY);
    const senderEmail = (process.env.SENDER_EMAIL || process.env.MAIL_FROM || '').trim();
    if ((channel === 'email' || channel === 'both') && (!hasAwsCreds || !senderEmail)) {
      return json(400, { ok: false, error: 'AWS SES認証情報(SES_ACCESS_KEY, SES_SECRET_KEY)または送信元アドレス(SENDER_EMAIL)が設定されていません。' });
    }

    console.log(`[schedule-dispatch] Amazon SES にて即時配信開始: 対象総数 ${targetList.length} 件`);

    // 全件のメッセージ本文を展開
    const allPayloads = targetList.map(t => {
      const name = t.customerName || t.name || 'お客様';
      const subj = t.subject || customSubject || '赤沢温泉旅館からのお知らせ';
      let msg = t.message || customMessage || '';
      msg = msg.replace(/{customer_name}/g, name);
      return {
        email: t.email,
        lineUserId: t.lineUserId,
        subject: subj,
        message: msg,
        customerName: name
      };
    });

    let sendResult = { count: 0, failedNames: [] };
    if (channel === 'email' || channel === 'both') {
      sendResult = await sendEmailBatchSES(allPayloads, senderEmail, scenario);
    }

    const totalSuccessCount = sendResult.count || 0;
    const totalFailedCount = (sendResult.failedNames || []).length;

    console.log(`[schedule-dispatch] 送信完了: 成功 ${totalSuccessCount} 件, 失敗 ${totalFailedCount} 件`);

    return json(200, {
      ok: true,
      todaySentCount: totalSuccessCount,
      todayFailedCount: totalFailedCount,
      remainingCount: 0,
      scheduleId: null,
      details: sendResult
    });
  } catch (err) {
    console.error('[schedule-dispatch] エラー:', err);
    return json(500, { ok: false, error: err.message });
  }
};

// URLクリック追跡の自動ラッピング
function wrapLinksWithTracking(text, cid, scenario) {
  if (!text) return text;
  const baseUrl = 'https://hotel-ai.netlify.app/api/track-click';
  const urlRegex = /(https?:\/\/[^\s\n\r<>"']+)/g;

  return text.replace(urlRegex, (matchUrl) => {
    if (matchUrl.includes('/api/track-click') || matchUrl.includes('/api/track-open') || matchUrl.includes('/api/unsubscribe')) {
      return matchUrl;
    }
    let detectedPlan = 'normal';
    const lUrl = matchUrl.toLowerCase();
    if (lUrl.includes('lastminute') || lUrl.includes('chokuzen')) detectedPlan = 'lastminute';
    else if (lUrl.includes('bbq') || lUrl.includes('course')) detectedPlan = 'bbq';
    else if (lUrl.includes('hp') || lUrl.includes('official') || lUrl.includes('basic')) detectedPlan = 'hp';

    return `${baseUrl}?cid=${encodeURIComponent(cid || 'guest')}&campaign=${encodeURIComponent(scenario || 'crm')}&plan=${detectedPlan}&channel=email&url=${encodeURIComponent(matchUrl)}`;
  });
}

// Amazon SES での全件送信処理
async function sendEmailBatchSES(payloads, from, scenario) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validPayloads = payloads.filter(p => {
    if (!p.email) return false;
    const cleanEmail = String(p.email).trim();
    return emailRegex.test(cleanEmail) && !cleanEmail.includes('..') && !cleanEmail.includes('.@') && !cleanEmail.includes('@.') && !cleanEmail.startsWith('.');
  });

  if (validPayloads.length === 0) return { type: 'email', count: 0, failedNames: [] };

  const sesClient = getSesClient();
  if (!sesClient) {
    return { type: 'email', count: 0, failedNames: ['AWS SES クライアントが初期化できませんでした'] };
  }

  let totalSent = 0;
  const failedNames = [];

  // 並行数を5に設定
  const concurrency = 5;
  for (let i = 0; i < validPayloads.length; i += concurrency) {
    const chunk = validPayloads.slice(i, i + concurrency);

    const promises = chunk.map(async (p) => {
      const cid = (p.email || 'guest').trim().toLowerCase();
      const wrappedMessage = wrapLinksWithTracking(p.message, cid, scenario);
      const trackOpenUrl = `https://hotel-ai.netlify.app/api/track-open?cid=${encodeURIComponent(cid)}&campaign=${encodeURIComponent(scenario || 'custom')}&channel=email`;
      const htmlBody = `
        <div style="font-family: sans-serif; font-size: 15px; line-height: 1.7; color: #333; white-space: pre-wrap;">${wrappedMessage}</div>
        <img src="${trackOpenUrl}" width="1" height="1" style="display:none !important; width:1px; height:1px; border:0;" alt="" />
      `;

      const sendEmailParams = {
        Source: formatSender(from),
        Destination: {
          ToAddresses: [p.email.trim()]
        },
        Message: {
          Subject: {
            Data: p.subject || '赤沢温泉旅館からのお知らせ',
            Charset: 'UTF-8'
          },
          Body: {
            Text: {
              Data: wrappedMessage,
              Charset: 'UTF-8'
            },
            Html: {
              Data: htmlBody,
              Charset: 'UTF-8'
            }
          }
        }
      };

      if (process.env.REPLY_TO) {
        sendEmailParams.ReplyToAddresses = [process.env.REPLY_TO.trim()];
      }

      try {
        const command = new SendEmailCommand(sendEmailParams);
        await sesClient.send(command);
        totalSent++;
      } catch (err) {
        console.warn(`[schedule-dispatch] SES送信エラー (${p.email}):`, err.message);
        failedNames.push(`${p.email} (${err.message})`);
      }
    });

    await Promise.all(promises);

    if (i + concurrency < validPayloads.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return { type: 'email', count: totalSent, provider: 'amazon-ses', failedNames };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}

/**
 * 送信元（From）アドレスをRFC 2047（MIME Base64）形式で整形
 * 受信者画面で「赤沢温泉旅館」と明瞭に表示されるようにする
 */
function formatSender(rawSender, defaultName = '赤沢温泉旅館') {
  if (!rawSender) return '';
  const trimmed = rawSender.trim();
  let name = (process.env.SENDER_NAME || '').trim() || defaultName;
  let email = trimmed;

  const angleMatch = trimmed.match(/^(.*?)(?:<([^>]+)>)$/);
  if (angleMatch) {
    const parsedName = angleMatch[1].replace(/["']/g, '').trim();
    if (parsedName) name = parsedName;
    email = angleMatch[2].trim();
  }

  // 表示名を RFC 2047 (MIME Base64) エンコードしてSESに渡す
  const encodedName = `=?UTF-8?B?${Buffer.from(name, 'utf-8').toString('base64')}?=`;
  return `${encodedName} <${email}>`;
}

