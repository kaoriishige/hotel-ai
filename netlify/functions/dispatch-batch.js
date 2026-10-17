const fs = require('fs');
const path = require('path');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

// オプトアウトおよびバウンス（不達）の抑制リスト読み込み
function getSuppressedEmails() {
  const optouts = new Set();
  const bounces = new Set();

  try {
    const optPath = path.join(__dirname, 'data', 'optouts.json');
    if (fs.existsSync(optPath)) {
      const list = JSON.parse(fs.readFileSync(optPath, 'utf8') || '[]');
      list.forEach(item => {
        if (item.email) optouts.add(String(item.email).trim().toLowerCase());
      });
    }
  } catch (e) {}

  try {
    const bouncePath = path.join(__dirname, 'data', 'undelivered_raw.json');
    if (fs.existsSync(bouncePath)) {
      const list = JSON.parse(fs.readFileSync(bouncePath, 'utf8') || '[]');
      list.forEach(item => {
        const em = item.email || item.recipient || item.to;
        if (em) bounces.add(String(em).trim().toLowerCase());
      });
    }
  } catch (e) {}

  return { optouts, bounces };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  try {
    let { payloads, channel, scenario } = JSON.parse(event.body || '{}');
    if (!payloads || !Array.isArray(payloads) || payloads.length === 0) {
      return json(400, { ok: false, error: 'payloads array is required' });
    }
    if (payloads.length > 100) {
      return json(400, { ok: false, error: 'max 100 payloads per batch request allowed' });
    }

    // === 宛先重複排除 (同一メールアドレスまたはLINE IDへの多重送信を防止) ===
    const seenEmails = new Set();
    const seenLineUsers = new Set();
    const uniquePayloads = [];

    payloads.forEach(p => {
      let isDuplicate = false;
      if (channel === 'email' || channel === 'both') {
        if (p.email) {
          const cleanEmail = String(p.email).trim().toLowerCase();
          if (seenEmails.has(cleanEmail)) {
            isDuplicate = true;
          } else {
            seenEmails.add(cleanEmail);
          }
        }
      }
      if (channel === 'line' || channel === 'both') {
        if (p.lineUserId) {
          const cleanLine = String(p.lineUserId).trim();
          if (seenLineUsers.has(cleanLine)) {
            isDuplicate = true;
          } else {
            seenLineUsers.add(cleanLine);
          }
        }
      }
      if (!isDuplicate) {
        uniquePayloads.push(p);
      }
    });
    payloads = uniquePayloads;

    // === 事前バリデーション＆オプトアウト/バウンス完全遮断 ===
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const hasAwsCreds = !!(process.env.AWS_ACCESS_KEY && process.env.AWS_SECRET_KEY);
    const senderEmail = (process.env.SENDER_EMAIL || process.env.MAIL_FROM || '').trim();
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if ((channel === 'email' || channel === 'both') && (!hasAwsCreds || !senderEmail)) {
      return json(400, { ok: false, error: 'AWS認証情報(AWS_ACCESS_KEY, AWS_SECRET_KEY)または送信元アドレス(SENDER_EMAIL)が設定されていません。送信処理は開始されていません。' });
    }
    if ((channel === 'line' || channel === 'both') && !lineToken) {
      return json(400, { ok: false, error: 'LINE配信用のアクセストークン(LINE_CHANNEL_ACCESS_TOKEN)が設定されていません。送信処理は開始されていません。' });
    }

    const { optouts, bounces } = getSuppressedEmails();

    const validPayloads = [];
    const skippedInvalidPayloads = [];
    const skippedOptOuts = [];
    const skippedBounces = [];

    payloads.forEach((p, idx) => {
      const name = p.customerName || `No.${idx + 1}`;
      let isInvalid = false;
      let reason = '';

      // メッセージ本文の検証
      if (!p.message || String(p.message).trim() === '') {
        isInvalid = true;
        reason = '本文が空欄';
      }

      if (channel === 'email' || channel === 'both') {
        if (!p.subject || String(p.subject).trim() === '') {
          isInvalid = true;
          reason = '件名が空欄';
        }
        if (!p.email || String(p.email).trim() === '') {
          isInvalid = true;
          reason = 'メールアドレスが空欄';
        } else {
          const cleanEmail = String(p.email).trim().toLowerCase();

          // 1. オプトアウト（配信停止）チェック
          if (p.unsubscribed === true || optouts.has(cleanEmail)) {
            isInvalid = true;
            reason = '【安全遮断】配信停止（オプトアウト）登録済み';
            skippedOptOuts.push(`${name} <${cleanEmail}>`);
          }
          // 2. 過去バウンス（不達）チェック
          else if (bounces.has(cleanEmail)) {
            isInvalid = true;
            reason = '【安全遮断】過去バウンス（不達）無効アドレス';
            skippedBounces.push(`${name} <${cleanEmail}>`);
          } else {
            const isFormatValid = emailRegex.test(cleanEmail);
            const hasRfcViolation = cleanEmail.includes('..') || cleanEmail.includes('.@') || cleanEmail.includes('@.') || cleanEmail.startsWith('.');
            if (!isFormatValid || hasRfcViolation) {
              isInvalid = true;
              reason = `${p.email} (無効またはRFC規格違反)`;
            }
          }
        }
      }
      if (channel === 'line' || channel === 'both') {
        if (!p.lineUserId) {
          isInvalid = true;
          reason = reason ? `${reason} / LINE ID未連携` : 'LINE ID未連携';
        }
      }

      if (isInvalid) {
        skippedInvalidPayloads.push(`${name}: ${reason}`);
      } else {
        validPayloads.push(p);
      }
    });

    const results = {};
    let hasErrors = false;

    if (channel === 'email' || channel === 'both') {
      results.email = await sendEmailBatchSES(validPayloads);
      if (results.email.failedNames && results.email.failedNames.length > 0) {
        hasErrors = true;
      }
      if (skippedInvalidPayloads.length > 0) {
        results.email.skippedNames = (results.email.skippedNames || []).concat(skippedInvalidPayloads);
      }
      results.email.skippedOptOuts = skippedOptOuts;
      results.email.skippedBounces = skippedBounces;
    }

    if (channel === 'line' || channel === 'both') {
      results.line = await sendLineBatch(validPayloads);
      if (results.line.failedNames && results.line.failedNames.length > 0) {
        hasErrors = true;
      }
    }

    return json(200, { ok: true, scenario, channel, results, hasErrors, mode: runtimeMode() });
  } catch (error) {
    return json(500, { ok: false, error: error.message, mode: runtimeMode() });
  }
};

function getSesClient() {
  const accessKeyId = (process.env.AWS_ACCESS_KEY || '').trim();
  const secretAccessKey = (process.env.AWS_SECRET_KEY || '').trim();
  const region = (process.env.AWS_REGION_KEY || 'ap-northeast-1').trim();

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

async function sendEmailBatchSES(payloads) {
  const sesClient = getSesClient();
  const senderEmail = (process.env.SENDER_EMAIL || process.env.MAIL_FROM || '').trim();

  if (!sesClient || !senderEmail) {
    return {
      type: 'email',
      status: 'mock',
      count: payloads.length,
      sample: payloads.slice(0, 2),
      skippedNames: []
    };
  }

  let sentCount = 0;
  const failedNames = [];
  const responsesData = [];

  // 並行数を5に設定し、SESのレートリミットを考慮しながら送信
  const concurrency = 5;
  for (let i = 0; i < payloads.length; i += concurrency) {
    const chunk = payloads.slice(i, i + concurrency);

    const promises = chunk.map(async (p) => {
      const cid = p.customerId || (p.email ? p.email.split('@')[0] : 'guest');
      const trackingPixelUrl = `https://hotel-ai.netlify.app/api/track-open?cid=${encodeURIComponent(cid)}&campaign=crm`;
      const htmlBody = (p.message || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>')
        .replace(/(https?:\/\/[^\s<]+)/g, (url) => {
          const trackingClickUrl = `https://hotel-ai.netlify.app/api/track-click?cid=${encodeURIComponent(cid)}&channel=email&url=${encodeURIComponent(url)}`;
          return `<a href="${trackingClickUrl}" target="_blank" style="color: #2563eb; text-decoration: underline;">${url}</a>`;
        })
        + `<br/><br/><img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;

      const sendEmailParams = {
        Source: senderEmail,
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
              Data: p.message || '',
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
        const res = await sesClient.send(command);
        sentCount++;
        responsesData.push({ to: p.email, messageId: res.MessageId });
      } catch (err) {
        console.error(`[sendEmailBatchSES] 送信失敗 (${p.email}):`, err.message);
        failedNames.push(`${p.email} (${err.message})`);
      }
    });

    await Promise.all(promises);

    // 短時間での過密アクセスを緩和
    if (i + concurrency < payloads.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return {
    type: 'email',
    status: failedNames.length > 0 && sentCount === 0 ? 'failed' : 'sent',
    provider: 'amazon-ses',
    count: sentCount,
    data: responsesData,
    failedNames
  };
}

async function sendLineBatch(payloads) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return {
      type: 'line',
      status: 'mock',
      count: payloads.length,
      sample: payloads.slice(0, 2)
    };
  }

  let sentCount = 0;
  const failedNames = [];

  for (const p of payloads) {
    if (!p.lineUserId) continue;

    try {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: p.lineUserId,
          messages: [{ type: 'text', text: p.message.slice(0, 4900) }]
        })
      });

      if (res.ok) {
        sentCount++;
      } else {
        const errData = await res.text();
        failedNames.push(`${p.customerName || p.lineUserId}: LINEエラー(${res.status}) ${errData}`);
      }
    } catch (err) {
      failedNames.push(`${p.customerName || p.lineUserId}: 送信例外 ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 50));
  }

  return {
    type: 'line',
    status: failedNames.length > 0 && sentCount === 0 ? 'failed' : 'sent',
    provider: 'line',
    count: sentCount,
    failedNames
  };
}

function runtimeMode() {
  return (process.env.AWS_ACCESS_KEY && process.env.AWS_SECRET_KEY) || process.env.LINE_CHANNEL_ACCESS_TOKEN ? 'live_or_partial' : 'mock';
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}
