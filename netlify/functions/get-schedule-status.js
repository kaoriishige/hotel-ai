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
  if (event.httpMethod === 'POST') {
    // スケジュール停止またはステータス更新リクエスト
    try {
      const { action, scheduleId } = JSON.parse(event.body || '{}');
      const db = getDb();
      if (!scheduleId) return json(400, { ok: false, error: 'scheduleId is required' });

      if (action === 'cancel' || action === 'pause') {
        await db.collection('mail_schedules').doc(scheduleId).update({
          status: action === 'cancel' ? 'cancelled' : 'paused',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return json(200, { ok: true, message: `スケジュールを ${action} に変更しました` });
      }

      return json(400, { ok: false, error: 'Unknown action' });
    } catch (e) {
      return json(500, { ok: false, error: e.message });
    }
  }

  // GET: アクティブなスケジュール一覧の取得
  try {
    const db = getDb();
    const snapshot = await db.collection('mail_schedules')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const list = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      list.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : null,
        lastRunAt: data.lastRunAt && data.lastRunAt.toDate ? data.lastRunAt.toDate().toISOString() : null
      });
    });

    return json(200, { ok: true, schedules: list });
  } catch (err) {
    return json(200, { ok: false, error: err.message, schedules: [] });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}
