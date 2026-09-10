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

function getResendApiKeys() {
  const keys = [];
  const k1 = process.env.RESEND_API_KEYS1 || process.env.RESEND_API_KEY_1 || process.env.RESEND_API_KEY;
  if (k1 && k1.trim()) keys.push(k1.trim());

  for (let i = 2; i <= 10; i++) {
    const k = process.env[`RESEND_API_KEYS${i}`] || process.env[`RESEND_API_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  return [...new Set(keys)];
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

    const apiKeys = getResendApiKeys();
    const from = process.env.MAIL_FROM || '赤沢温泉旅館 <info@mail.akasawaonsen.com>';
    if ((channel === 'email' || channel === 'both') && apiKeys.length === 0) {
      return json(400, { ok: false, error: 'RESEND_API_KEYS が設定されていません。' });
    }

    console.log(`[schedule-dispatch] 即時一括配信開始: 対象総数 ${targetList.length} 件 (時間指定なし・即時全件送信)`);

    // 朝08:00の時間指定・分割制限を完全削除し、対象者全員を即時一括送信
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
      sendResult = await sendEmailMultiKeyBatchParallel(allPayloads, apiKeys, from, scenario);
    }

    const totalSuccessCount = sendResult.count || 0;
    const totalFailedCount = (sendResult.failedNames || []).length;

    console.log(`[schedule-dispatch] 即時一括配信完了: 成功 ${totalSuccessCount} 件, 失敗 ${totalFailedCount} 件`);

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

function getFromAddressForKey(keyNum, defaultFrom) {
  if (keyNum === 1) {
    return defaultFrom || '赤沢温泉旅館 <info@mail.akasawaonsen.com>';
  }
  if (defaultFrom && defaultFrom.includes('@mail.')) {
    return defaultFrom.replace(/@mail\./g, `@mail${keyNum}.`);
  }
  return `赤沢温泉旅館 <info@mail${keyNum}.akasawaonsen.com>`;
}

// 複数APIキーへの並列チャンク送信（時間指定なし・即時全件一括送信）
async function sendEmailMultiKeyBatchParallel(payloads, apiKeys, from, scenario) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validPayloads = payloads.filter(p => {
    if (!p.email) return false;
    const cleanEmail = String(p.email).trim();
    return emailRegex.test(cleanEmail) && !cleanEmail.includes('..') && !cleanEmail.includes('.@') && !cleanEmail.includes('@.') && !cleanEmail.startsWith('.');
  });

  if (validPayloads.length === 0) return { type: 'email', count: 0, failedNames: [] };

  const keyCapacity = 100;
  const chunks = [];
  for (let i = 0; i < validPayloads.length; i += keyCapacity) {
    chunks.push(validPayloads.slice(i, i + keyCapacity));
  }

  let totalSent = 0;
  const failedNames = [];
  const usedKeysSummary = [];

  // 全チャンクを登録済みAPIキーで巡回し、並列送信（上限・時間指定なし）
  const sendPromises = chunks.map(async (chunk, chunkIdx) => {
    const keyIndex = chunkIdx % (apiKeys.length || 1);
    const keyNum = keyIndex + 1;
    const currentKey = apiKeys.length > 0 ? apiKeys[keyIndex] : process.env.RESEND_API_KEY;
    const keyFrom = getFromAddressForKey(keyNum, from);

    const chunkRequests = chunk.map(p => {
      const cid = (p.email || 'guest').trim().toLowerCase();
      const wrappedMessage = wrapLinksWithTracking(p.message, cid, scenario);
      
      const trackOpenUrl = `https://hotel-ai.netlify.app/api/track-open?cid=${encodeURIComponent(cid)}&campaign=${encodeURIComponent(scenario || 'custom')}&channel=email`;
      
      const htmlBody = `
        <div style="font-family: sans-serif; font-size: 15px; line-height: 1.7; color: #333; white-space: pre-wrap;">${wrappedMessage}</div>
        <img src="${trackOpenUrl}" width="1" height="1" style="display:none !important; width:1px; height:1px; border:0;" alt="" />
      `;

      const req = {
        from: keyFrom,
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
          Authorization: `Bearer ${currentKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(chunkRequests)
      });

      let data = await res.json();
      
      if (res.ok) {
        totalSent += chunkRequests.length;
        usedKeysSummary.push({ keyNum, count: chunkRequests.length, from: keyFrom });
      } else {
        console.warn(`[schedule-dispatch] Resend Key ${keyNum} (${keyFrom}) batch error:`, data);
        chunk.forEach(p => failedNames.push(`${p.email} (${data.message || '送信失敗'})`));
      }
    } catch (err) {
      console.warn(`[schedule-dispatch] Key ${keyNum} fetch error:`, err.message);
      chunk.forEach(p => failedNames.push(`${p.email} (${err.message})`));
    }
  });

  await Promise.all(sendPromises);

  return { type: 'email', count: totalSent, usedKeys: usedKeysSummary, failedNames };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}
