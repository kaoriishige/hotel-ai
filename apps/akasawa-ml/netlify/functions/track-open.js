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

// 1x1 透明 GIF (Base64)
const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const cid = (params.cid || 'anonymous').trim().toLowerCase();
  const campaign = (params.campaign || 'crm').trim();
  const logId = (params.logId || '').trim();

  try {
    let db = null;
    try {
      if (getDb) db = getDb();
    } catch (e) {}

    if (db && admin) {
      const safeCid = encodeURIComponent(cid).replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeCamp = encodeURIComponent(campaign).replace(/[^a-zA-Z0-9_-]/g, '_');
      const openDocId = `open_${safeCid}_${safeCamp}`;

      await db.collection('mail_events').doc(openDocId).set({
        type: 'open',
        cid,
        campaign,
        logId,
        createdAt: new Date().toISOString(),
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    console.log(`[track-open] メール開封検知(ユニーク記録): cid=${cid}, campaign=${campaign}`);
  } catch (err) {
    console.warn('[track-open] 開封記録エラー:', err.message);
  }

  // 1x1 透明GIFをレスポンス
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    body: TRANSPARENT_GIF.toString('base64'),
    isBase64Encoded: true
  };
};
