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
  // 一括配信・スケジュール配信は RESEND_API_KEYS2〜6 (5キー × 100件 = 500件/日) を使用
  for (let i = 2; i <= 6; i++) {
    const k = process.env[`RESEND_API_KEYS${i}`] || process.env[`RESEND_API_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  // 万が一2〜6が未設定の場合はKey 1へフォールバック
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
    const from = process.env.MAIL_FROM;
    if ((channel === 'email' || channel === 'both') && (apiKeys.length === 0 || !from)) {
      return json(400, { ok: false, error: 'RESEND_API_KEYS1〜5またはMAIL_FROMが設定されていません。' });
    }

    // 初回本日分（最大500件）の抽出
    const dailyLimit = apiKeys.length * 100; // 5キー × 100件 = 500件
    const todayPayloads = payloads.slice(0, dailyLimit);
    const remainingPayloads = payloads.slice(dailyLimit);

    console.log(`[schedule-dispatch] 受付総数: ${payloads.length}件, 本日即時送信: ${todayPayloads.length}件, 明日以降自動配信: ${remainingPayloads.length}件`);

    // 1. 本日分の即時送信
    let todaySendResult = null;
    let todaySuccessCount = 0;
    let todayFailedCount = 0;
    const failedNames = [];

    if (channel === 'email' || channel === 'both') {
      todaySendResult = await sendEmailMultiKeyBatch(todayPayloads, apiKeys, from);
      todaySuccessCount = todaySendResult.count || 0;
      if (todaySendResult.failedNames && todaySendResult.failedNames.length > 0) {
        failedNames.push(...todaySendResult.failedNames);
        todayFailedCount += todaySendResult.failedNames.length;
      }
    }

    // 2. 残りがある場合は Firestore にスケジュールキューを保存
    let scheduleId = null;
    let db = null;
    try {
      db = getDb();
    } catch (e) {
      console.warn('Firestore not configured or error:', e.message);
    }

    if (remainingPayloads.length > 0 && db) {
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
        remainingPayloads: remainingPayloads,
        status: 'active', // active, paused, completed, cancelled
        nextRunTimeJST: '翌朝 08:00 (JST)',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
        history: [{
          runAt: new Date().toISOString(),
          sentCount: todaySuccessCount,
          failedCount: todayFailedCount,
          usedKeys: todaySendResult ? todaySendResult.usedKeys : []
        }]
      };

      await db.collection('mail_schedules').doc(scheduleId).set(scheduleDoc);
      console.log(`[schedule-dispatch] Firestore にスケジュールキュー保存完了: ID=${scheduleId}, 残り=${remainingPayloads.length}件`);
    }

    return json(200, {
      ok: true,
      todaySentCount: todaySuccessCount,
      todayFailedCount,
      remainingCount: remainingPayloads.length,
      scheduleId,
      status: remainingPayloads.length > 0 ? 'scheduled' : 'completed',
      message: remainingPayloads.length > 0
        ? `本日分 ${todaySuccessCount} 件の送信が完了しました。残り ${remainingPayloads.length} 件は【毎朝08:00】に自動で分散配信されます。`
        : `全 ${todaySuccessCount} 件の配信が完了しました！`
    });
  } catch (err) {
    console.error('[schedule-dispatch] エラー:', err);
    return json(500, { ok: false, error: err.message });
  }
};

async function sendEmailMultiKeyBatch(payloads, apiKeys, from) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const validPayloads = payloads.filter(p => {
    if (!p.email) return false;
    const cleanEmail = String(p.email).trim();
    return emailRegex.test(cleanEmail) && !cleanEmail.includes('..') && !cleanEmail.includes('.@');
  });

  const batchRequests = validPayloads.map(p => {
    const req = {
      from,
      to: p.email,
      subject: p.subject,
      text: p.message
    };
    if (process.env.REPLY_TO) req.reply_to = process.env.REPLY_TO;
    return req;
  });

  if (batchRequests.length === 0) return { type: 'email', status: 'skipped', count: 0 };

  const keyCapacity = 100;
  let keyIndex = 0;
  let sentCount = 0;
  const failedNames = [];
  const usedKeysSummary = [];

  for (let i = 0; i < batchRequests.length; i += keyCapacity) {
    if (keyIndex >= apiKeys.length) {
      const remainingUnsent = batchRequests.slice(i);
      remainingUnsent.forEach(r => failedNames.push(`${r.to} (本日枠上限到達)`));
      break;
    }

    const currentKey = apiKeys[keyIndex];
    const chunkRequests = batchRequests.slice(i, i + keyCapacity);

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
      if (!res.ok) {
        keyIndex++;
        if (keyIndex < apiKeys.length) {
          i -= keyCapacity;
          continue;
        } else {
          throw new Error(`Resend Batch API Error: ${JSON.stringify(data)}`);
        }
      }

      sentCount += chunkRequests.length;
      usedKeysSummary.push({ keyNum: keyIndex + 1, count: chunkRequests.length });
      keyIndex++;
    } catch (err) {
      keyIndex++;
      if (keyIndex < apiKeys.length) {
        i -= keyCapacity;
      } else {
        throw err;
      }
    }
  }

  return { type: 'email', count: sentCount, usedKeys: usedKeysSummary, failedNames };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}
