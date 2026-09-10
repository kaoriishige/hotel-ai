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

// ユーザー指示: RESEND_API_KEYS1〜7は使用せず、単一の RESEND_API_KEY のみを使用
function getResendApiKey() {
  const key = process.env.RESEND_API_KEY;
  return key ? key.trim() : '';
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

    const resendKey = getResendApiKey();
    const from = process.env.MAIL_FROM || '赤沢温泉旅館 <info@mail.akasawaonsen.com>';
    if ((channel === 'email' || channel === 'both') && !resendKey) {
      return json(400, { ok: false, error: 'RESEND_API_KEY が設定されていません。' });
    }

    console.log(`[schedule-dispatch] RESEND_API_KEY 単一キーにて即時一括配信開始: 対象総数 ${targetList.length} 件`);

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
      sendResult = await sendEmailSingleKeyBatch(allPayloads, resendKey, from, scenario);
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

// 単一RESEND_API_KEYでの全件一括送信処理
async function sendEmailSingleKeyBatch(payloads, resendKey, from, scenario) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validPayloads = payloads.filter(p => {
    if (!p.email) return false;
    const cleanEmail = String(p.email).trim();
    return emailRegex.test(cleanEmail) && !cleanEmail.includes('..') && !cleanEmail.includes('.@') && !cleanEmail.includes('@.') && !cleanEmail.startsWith('.');
  });

  if (validPayloads.length === 0) return { type: 'email', count: 0, failedNames: [] };

  const keyCapacity = 100; // Resend Batch API の最大100件/リクエスト
  const chunks = [];
  for (let i = 0; i < validPayloads.length; i += keyCapacity) {
    chunks.push(validPayloads.slice(i, i + keyCapacity));
  }

  let totalSent = 0;
  const failedNames = [];

  // レートリミット制限（429）を回避しながら高速送信するため、適度な並列度（最大5並列）でチャンクを送信
  const concurrency = 4;
  for (let i = 0; i < chunks.length; i += concurrency) {
    const currentBatchChunks = chunks.slice(i, i + concurrency);

    const batchPromises = currentBatchChunks.map(async (chunk) => {
      const chunkRequests = chunk.map(p => {
        const cid = (p.email || 'guest').trim().toLowerCase();
        const wrappedMessage = wrapLinksWithTracking(p.message, cid, scenario);
        const trackOpenUrl = `https://hotel-ai.netlify.app/api/track-open?cid=${encodeURIComponent(cid)}&campaign=${encodeURIComponent(scenario || 'custom')}&channel=email`;
        const htmlBody = `
          <div style="font-family: sans-serif; font-size: 15px; line-height: 1.7; color: #333; white-space: pre-wrap;">${wrappedMessage}</div>
          <img src="${trackOpenUrl}" width="1" height="1" style="display:none !important; width:1px; height:1px; border:0;" alt="" />
        `;

        const req = {
          from,
          to: p.email,
          subject: p.subject,
          text: wrappedMessage,
          html: htmlBody
        };
        if (process.env.REPLY_TO) req.reply_to = process.env.REPLY_TO;
        return req;
      });

      try {
        const res = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(chunkRequests)
        });

        let data = await res.json();

        if (res.ok) {
          totalSent += chunkRequests.length;
        } else {
          console.warn('[schedule-dispatch] Resend single key batch error:', data);
          chunk.forEach(p => failedNames.push(`${p.email} (${data.message || '送信失敗'})`));
        }
      } catch (err) {
        console.warn('[schedule-dispatch] Resend fetch error:', err.message);
        chunk.forEach(p => failedNames.push(`${p.email} (${err.message})`));
      }
    });

    await Promise.all(batchPromises);

    // 短時間の過密アクセスによるレート制限(429)を防ぐため、ごくわずかなインターバル(120ms)を設ける
    if (i + concurrency < chunks.length) {
      await new Promise(r => setTimeout(r, 120));
    }
  }

  return { type: 'email', count: totalSent, usedKeys: [{ key: 'RESEND_API_KEY', count: totalSent, from }], failedNames };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}
