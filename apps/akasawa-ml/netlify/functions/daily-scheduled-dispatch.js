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
  const k = process.env.RESEND_API_KEY;
  return k && k.trim() ? [k.trim()] : [];
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

    return `${baseUrl}?cid=${encodeURIComponent(cid || 'guest')}&campaign=${encodeURIComponent(scenario || 'daily-crm')}&plan=${detectedPlan}&channel=email&url=${encodeURIComponent(matchUrl)}`;
  });
}

// 毎日朝 08:00 (JST) = UTC 23:00 に自動実行
const handler = async (event) => {
  console.log('⏰ [daily-scheduled-dispatch] 朝08:00 定期配信ジョブが起動しました (上限撤廃・全件一括配信モード)');

  try {
    const db = getDb();
    if (!db) {
      console.error('[daily-scheduled-dispatch] Firestore DB is not available');
      return json(500, { ok: false, error: 'Firestore DB unavailable' });
    }

    // mail_schedules と dispatch_schedules の両コレクションから active な予約を取得
    const mailSnap = await db.collection('mail_schedules')
      .where('status', '==', 'active')
      .get();
    
    let docs = [...mailSnap.docs];

    try {
      const dispatchSnap = await db.collection('dispatch_schedules')
        .where('status', '==', 'active')
        .get();
      const existingIds = new Set(docs.map(d => d.id));
      dispatchSnap.docs.forEach(d => {
        if (!existingIds.has(d.id)) docs.push(d);
      });
    } catch (e) {}

    if (docs.length === 0) {
      console.log('[daily-scheduled-dispatch] 実行待ちのアクティブなスケジュールはありません');
      return json(200, { ok: true, message: 'No active schedules found' });
    }

    const apiKeys = getResendApiKeys();
    const from = process.env.MAIL_FROM || '赤沢温泉旅館 <info@mail.akasawaonsen.com>';

    const results = [];

    for (const doc of docs) {
      const schedule = doc.data();
      const rawList = schedule.remainingCustomers || schedule.remainingPayloads || [];

      if (rawList.length === 0) {
        await doc.ref.update({
          status: 'completed',
          remainingCount: 0,
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        continue;
      }

      // ★ 1日の上限（100件/500件）を完全に撤廃し、残りの全件を一括配信 ★
      const allTargets = rawList.map(p => {
        const name = p.customerName || p.name || 'お客様';
        const subj = p.subject || schedule.customSubject || schedule.title || '赤沢温泉旅館からのお知らせ';
        let msg = p.message || schedule.customMessage || '';
        msg = msg.replace(/{customer_name}/g, name);
        return {
          email: p.email,
          lineUserId: p.lineUserId,
          subject: subj,
          message: msg,
          customerName: name
        };
      });

      console.log(`[daily-scheduled-dispatch] ジョブ "${schedule.title}" (ID: ${doc.id}) 配信開始: 残り全件=${allTargets.length}件を一括送信します`);

      const sendRes = await sendEmailMultiKeyBatch(allTargets, apiKeys, from, schedule.scenario);
      const sentCount = sendRes.count || 0;
      const failedCount = sendRes.failedNames ? sendRes.failedNames.length : 0;

      // 全件一括配信完了
      await doc.ref.update({
        sentCountSoFar: admin.firestore.FieldValue.increment(sentCount),
        remainingCount: 0,
        remainingCustomers: [],
        remainingPayloads: [],
        status: 'completed',
        lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        remainingCount: 0,
        status: 'completed'
      });
    }

    console.log('[daily-scheduled-dispatch] 全スケジュール一括配信処理完了:', JSON.stringify(results));
    return json(200, { ok: true, processed: results.length, results });
  } catch (err) {
    console.error('[daily-scheduled-dispatch] 定期実行エラー:', err);
    return json(500, { ok: false, error: err.message });
  }
};

async function sendEmailMultiKeyBatch(payloads, apiKeys, from, scenario) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validPayloads = payloads.filter(p => {
    if (!p.email) return false;
    const cleanEmail = String(p.email).trim();
    return emailRegex.test(cleanEmail) && !cleanEmail.includes('..') && !cleanEmail.includes('.@') && !cleanEmail.includes('@.') && !cleanEmail.startsWith('.');
  });

  if (validPayloads.length === 0) return { type: 'email', count: 0, failedNames: [] };

  const keyCapacity = 100;
  let sentCount = 0;
  const failedNames = [];
  const usedKeysSummary = [];

  // 全件を100件単位のチャンクに分割し、利用可能なAPIキーを巡回（ラウンドロビン）利用して全件一括送信
  for (let i = 0; i < validPayloads.length; i += keyCapacity) {
    const chunk = validPayloads.slice(i, i + keyCapacity);
    const keyIndex = Math.floor(i / keyCapacity) % (apiKeys.length || 1);
    const keyNum = keyIndex + 1;
    const currentKey = apiKeys.length > 0 ? apiKeys[keyIndex] : process.env.RESEND_API_KEY;
    const keyFrom = getFromAddressForKey(keyNum, from);

    const chunkRequests = chunk.map(p => {
      const cid = (p.email || 'guest').trim().toLowerCase();
      const wrappedMessage = wrapLinksWithTracking(p.message, cid, scenario);
      const trackOpenUrl = `https://hotel-ai.netlify.app/api/track-open?cid=${encodeURIComponent(cid)}&campaign=${encodeURIComponent(scenario || 'daily-crm')}&channel=email`;
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

      const data = await res.json();
      if (res.ok) {
        sentCount += chunkRequests.length;
        usedKeysSummary.push({ keyNum, count: chunkRequests.length, from: keyFrom });
      } else {
        console.warn(`[daily-scheduled-dispatch] Resend Key ${keyNum} batch error:`, data);
        chunk.forEach(p => failedNames.push(`${p.email} (${data.message || '送信失敗'})`));
      }
    } catch (err) {
      console.warn(`[daily-scheduled-dispatch] Key ${keyNum} fetch error:`, err.message);
      chunk.forEach(p => failedNames.push(`${p.email} (${err.message})`));
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
module.exports = {
  handler,
  config: {
    schedule: "0 23 * * *"
  }
};
