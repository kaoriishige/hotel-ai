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
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`RESEND_API_KEYS${i}`] || process.env[`RESEND_API_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  if (process.env.RESEND_API_KEYS) {
    const splitted = process.env.RESEND_API_KEYS.split(',').map(s => s.trim()).filter(Boolean);
    keys.push(...splitted);
  }
  return [...new Set(keys)];
}

// 毎日朝 08:00 (JST) = UTC 23:00 に自動実行
const handler = async (event) => {
  console.log('⏰ [daily-scheduled-dispatch] 朝08:00 定期配信ジョブが起動しました');

  try {
    const db = getDb();
    const snapshot = await db.collection('mail_schedules')
      .where('status', '==', 'active')
      .get();

    if (snapshot.empty) {
      console.log('[daily-scheduled-dispatch] 実行待ちのアクティブなスケジュールはありません');
      return json(200, { ok: true, message: 'No active schedules found' });
    }

    const apiKeys = getResendApiKeys();
    const from = process.env.MAIL_FROM;
    const dailyLimit = apiKeys.length * 100; // 5キー × 100件 = 500件

    const results = [];

    for (const doc of snapshot.docs) {
      const schedule = doc.data();
      const remainingPayloads = schedule.remainingPayloads || [];

      if (remainingPayloads.length === 0) {
        await doc.ref.update({
          status: 'completed',
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        continue;
      }

      // 本日配信分の抽出 (最大500件)
      const todayPayloads = remainingPayloads.slice(0, dailyLimit);
      const nextRemaining = remainingPayloads.slice(dailyLimit);

      console.log(`[daily-scheduled-dispatch] ジョブ "${schedule.title}" (ID: ${doc.id}) 配信開始: 本日分=${todayPayloads.length}件, 残り=${nextRemaining.length}件`);

      const sendRes = await sendEmailMultiKeyBatch(todayPayloads, apiKeys, from);
      const sentCount = sendRes.count || 0;
      const failedCount = sendRes.failedNames ? sendRes.failedNames.length : 0;

      const isAllDone = nextRemaining.length === 0;

      await doc.ref.update({
        sentCountSoFar: admin.firestore.FieldValue.increment(sentCount),
        remainingCount: nextRemaining.length,
        remainingPayloads: nextRemaining,
        status: isAllDone ? 'completed' : 'active',
        lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: isAllDone ? admin.firestore.FieldValue.serverTimestamp() : null,
        history: admin.firestore.FieldValue.arrayUnion({
          runAt: new Date().toISOString(),
          sentCount,
          failedCount,
          usedKeys: sendRes.usedKeys || []
        })
      });

      results.push({
        scheduleId: doc.id,
        title: schedule.title,
        sentCount,
        failedCount,
        remainingCount: nextRemaining.length,
        status: isAllDone ? 'completed' : 'active'
      });
    }

    console.log('[daily-scheduled-dispatch] 全スケジュール処理完了:', JSON.stringify(results));
    return json(200, { ok: true, processed: results.length, results });
  } catch (err) {
    console.error('[daily-scheduled-dispatch] 定期実行エラー:', err);
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

// Netlify Scheduled Function 設定（Cron: 毎日UTC 23:00 = JST 08:00）
// config.schedule が Netlify Functions 2.0 / Scheduled Functions で認識されます
module.exports = {
  handler,
  config: {
    schedule: "0 23 * * *"
  }
};
