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

exports.handler = async (event) => {
  // CORSヘッダー
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = event.httpMethod === 'POST' ? JSON.parse(event.body || '{}') : (event.queryStringParameters || {});
    const email = (body.email || '').trim().toLowerCase();
    const cid = (body.cid || '').trim();
    const reason = (body.reason || 'ユーザーによる配信停止リンククリック').trim();

    if (!email && !cid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'email または cid が必要です' })
      };
    }

    let db = null;
    try {
      if (getDb) db = getDb();
    } catch (e) {}

    const optOutRecord = {
      email: email || null,
      cid: cid || null,
      reason,
      unsubscribedAt: new Date().toISOString(),
      userAgent: event.headers['user-agent'] || '',
      ip: event.headers['client-ip'] || event.headers['x-forwarded-for'] || ''
    };

    if (db && admin) {
      const docId = email ? `optout_${Buffer.from(email).toString('hex').slice(0, 32)}` : `optout_cid_${cid}`;
      await db.collection('optouts').doc(docId).set({
        ...optOutRecord,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // 稼働中のスケジュール配信キューからも即座に該当顧客を除外
      const activeSchedules = await db.collection('mail_schedules').where('status', '==', 'active').get();
      for (const sDoc of activeSchedules.docs) {
        const sData = sDoc.data();
        const rem = sData.remainingPayloads || [];
        const filtered = rem.filter(p => {
          const pEm = (p.email || '').trim().toLowerCase();
          const pCid = p.cid || '';
          if (email && pEm === email) return false;
          if (cid && pCid === cid) return false;
          return true;
        });
        if (filtered.length !== rem.length) {
          await sDoc.ref.update({
            remainingPayloads: filtered,
            remainingCount: filtered.length
          });
        }
      }
    }

    console.log(`[unsubscribe] 配信停止受付完了: Email=${email}, CID=${cid}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: '配信停止手続きが完了しました',
        email,
        cid
      })
    };
  } catch (err) {
    console.error('[unsubscribe] エラー:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
