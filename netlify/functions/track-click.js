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
  const cid = (params.cid || 'anonymous').trim().toLowerCase();
  const plan = (params.plan || 'normal').trim();
  const channel = (params.channel || 'email').trim();
  const logId = (params.logId || '').trim();

  try {
    let db = null;
    try {
      if (getDb) db = getDb();
    } catch (e) {}

    if (db && admin) {
      const safeCid = encodeURIComponent(cid).replace(/[^a-zA-Z0-9_-]/g, '_');
      const safePlan = encodeURIComponent(plan).replace(/[^a-zA-Z0-9_-]/g, '_');
      const clickDocId = `click_${safeCid}_${safePlan}`;
      const openDocId = `open_${safeCid}`;

      // クリック記録
      await db.collection('mail_events').doc(clickDocId).set({
        type: 'click',
        cid,
        plan,
        channel,
        targetUrl,
        logId,
        createdAt: new Date().toISOString(),
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // クリックした＝100%開封しているため、開封イベントも自動で確実に記録（補正）
      await db.collection('mail_events').doc(openDocId).set({
        type: 'open',
        cid,
        campaign: plan || 'custom',
        channel,
        createdAt: new Date().toISOString(),
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    console.log(`[track-click] プランURLクリック＆開封連動検知: cid=${cid}, plan=${plan}`);
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
