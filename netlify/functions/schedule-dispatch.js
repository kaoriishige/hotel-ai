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
  // 一括配信・スケジュール配信は RESEND_API_KEYS2〜 (各キー100件/日) を使用
  for (let i = 2; i <= 10; i++) {
    const k = process.env[`RESEND_API_KEYS${i}`] || process.env[`RESEND_API_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  // 万が一2以降が未設定の場合はKey 1へフォールバック
  if (keys.length === 0) {
    const k1 = process.env.RESEND_API_KEYS1 || process.env.RESEND_API_KEY_1 || process.env.RESEND_API_KEY;
    if (k1 && k1.trim()) keys.push(k1.trim());
  }
  return [...new Set(keys)];
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { payloads, channel, scenario, customSubject, customMessage, scheduleTitle } = body;

    if (!payloads || !Array.isArray(payloads) || payloads.length === 0) {
      return json(400, { ok: false, error: 'payloads array is required' });
    }

    const apiKeys = getResendApiKeys();
    const from = process.env.MAIL_FROM || '赤沢温泉旅館 <onboarding@resend.dev>';
    if ((channel === 'email' || channel === 'both') && apiKeys.length === 0) {
      return json(400, { ok: false, error: 'RESEND_API_KEYS が設定されていません。' });
    }

    // 初回本日分（利用可能なキー数 × 100件）の抽出
    const dailyLimit = Math.max(apiKeys.length * 100, 100);
    const todayPayloads = payloads.slice(0, dailyLimit);
    const remainingPayloads = payloads.slice(dailyLimit);

    console.log(`[schedule-dispatch] 受付総数: ${payloads.length}件, 本日即時送信: ${todayPayloads.length}件, 明日以降自動配信: ${remainingPayloads.length}件`);

    // 1. 本日分の即時並列送信
    let todaySendResult = { count: 0, failedNames: [] };

    if (channel === 'email' || channel === 'both') {
      todaySendResult = await sendEmailMultiKeyBatchParallel(todayPayloads, apiKeys, from, scenario);
    }

    const todaySuccessCount = todaySendResult.count || 0;
    const todayFailedCount = (todaySendResult.failedNames || []).length;

    // 2. 残りがある場合は Firestore にスケジュールキューを保存
    let scheduleId = null;
    let db = null;
    try {
      if (getDb) db = getDb();
    } catch (e) {
      console.warn('Firestore not configured or error:', e.message);
    }

    if (remainingPayloads.length > 0 && db && admin) {
      scheduleId = 'sched_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      const scheduleDoc = {
        scheduleId,
        title: scheduleTitle || `赤沢温泉旅館 自動配信 (${payloads.length}件)`,
        scenario: scenario || 'custom',
        channel: channel || 'email',
        customSubject: customSubject || '',
        customMessage: customMessage || '',
        totalInitialCount: payloads.length,
        dailyLimit,
        sentCountSoFar: todaySuccessCount,
        remainingCount: remainingPayloads.length,
        remainingPayloads: remainingPayloads.slice(0, 1500), // Firestore上限考慮
        status: 'active',
        nextRunTimeJST: '翌朝 08:00 (JST)',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
        history: [{
          runAt: new Date().toISOString(),
          sentCount: todaySuccessCount,
          failedCount: todayFailedCount
        }]
      };

      try {
        await db.collection('dispatch_schedules').doc(scheduleId).set(scheduleDoc);
        console.log(`[schedule-dispatch] スケジュール登録完了: id=${scheduleId}, 残り=${remainingPayloads.length}件`);
      } catch (dbErr) {
        console.warn('[schedule-dispatch] DB保存エラー:', dbErr.message);
      }
    }

    return json(200, {
      ok: true,
      todaySentCount: todaySuccessCount,
      todayFailedCount: todayFailedCount,
      remainingCount: remainingPayloads.length,
      scheduleId,
      details: todaySendResult
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

// 複数APIキーへの並列チャンク送信（超高速化）
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

  // 各APIキーへ並列送信
  const sendPromises = chunks.map(async (chunk, chunkIdx) => {
    if (chunkIdx >= apiKeys.length) {
      chunk.forEach(p => failedNames.push(`${p.email} (本日枠上限到達)`));
      return;
    }

    const currentKey = apiKeys[chunkIdx];
    const chunkRequests = chunk.map(p => {
      const cid = (p.email || 'guest').trim().toLowerCase();
      const wrappedMessage = wrapLinksWithTracking(p.message, cid, scenario);
      const req = {
        from,
        to: p.email,
        subject: p.subject,
        text: wrappedMessage
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

      const data = await res.json();
      if (res.ok) {
        totalSent += chunkRequests.length;
        usedKeysSummary.push({ keyNum: chunkIdx + 1, count: chunkRequests.length });
      } else {
        console.warn(`[schedule-dispatch] Resend Key ${chunkIdx + 1} batch error:`, data);
        chunk.forEach(p => failedNames.push(`${p.email} (${data.message || '送信失敗'})`));
      }
    } catch (err) {
      console.warn(`[schedule-dispatch] Key ${chunkIdx + 1} fetch error:`, err.message);
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
