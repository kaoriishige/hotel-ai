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
  const params = event.queryStringParameters || {};
  const rawUrl = params.url || params.target;
  const targetUrl = rawUrl ? decodeURIComponent(rawUrl) : 'https://akasawaonsen.com/';
  const cid = params.cid || 'anonymous';
  const plan = params.plan || 'normal';
  const channel = params.channel || 'email';
  const logId = params.logId || '';

  try {
    let db = null;
    try {
      if (getDb) db = getDb();
    } catch (e) {}

    if (db && admin) {
      const clickDocId = `click_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection('mail_events').doc(clickDocId).set({
        type: 'click',
        cid,
        plan,
        channel,
        targetUrl,
        logId,
        createdAt: new Date().toISOString(),
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    console.log(`[track-click] プランURLクリック検知: cid=${cid}, plan=${plan}, target=${targetUrl}`);
  } catch (err) {
    console.warn('[track-click] クリック記録エラー:', err.message);
  }

  // 目的のプランページへ 302 リダイレクト
  return {
    statusCode: 302,
    headers: {
      'Location': targetUrl,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
    },
    body: ''
  };
};
