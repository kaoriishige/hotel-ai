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
  const cid = params.cid || 'anonymous';
  const campaign = params.campaign || 'default';
  const logId = params.logId || '';

  try {
    let db = null;
    try {
      if (getDb) db = getDb();
    } catch (e) {}

    if (db && admin) {
      const openDocId = `open_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection('mail_events').doc(openDocId).set({
        type: 'open',
        cid,
        campaign,
        logId,
        createdAt: new Date().toISOString(),
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    console.log(`[track-open] メール開封検知: cid=${cid}, campaign=${campaign}, logId=${logId}`);
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
