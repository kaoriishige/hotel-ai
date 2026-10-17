const fs = require('fs');
const path = require('path');

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

let fallbackLogs = [];
try {
  fallbackLogs = require('./data/dispatch_logs.json');
} catch (e) {}

const CANDIDATE_FILES = [
  path.join(__dirname, 'data', 'dispatch_logs.json'),
  path.join(__dirname, '..', '..', 'public', 'data', 'dispatch_logs.json'),
  path.join(process.cwd(), 'apps', 'akasawa-ml', 'public', 'data', 'dispatch_logs.json'),
  path.join(process.cwd(), 'scratch', 'dispatch_logs.json')
];

function loadLocalLogs() {
  for (const p of CANDIDATE_FILES) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
  }
  return Array.isArray(fallbackLogs) && fallbackLogs.length > 0 ? fallbackLogs : [];
}

function saveLocalLog(newLog) {
  for (const p of CANDIDATE_FILES) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      let current = [];
      if (fs.existsSync(p)) {
        try { current = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {}
      }
      if (!Array.isArray(current)) current = [];
      current.unshift(newLog);
      fs.writeFileSync(p, JSON.stringify(current, null, 2), 'utf8');
    } catch (e) {}
  }
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    let db = null;
    try { if (getDb) db = getDb(); } catch (e) {}

    // POST: 配信履歴の追記保存
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (!body.id) body.id = `log_${Date.now()}`;
      if (!body.time) body.time = new Date().toLocaleString('ja-JP');

      saveLocalLog(body);

      if (db && admin) {
        try {
          await db.collection('dispatch_logs').doc(body.id).set({
            ...body,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (dbErr) {
          console.warn('[get-dispatch-logs] Firestore保存エラー（ローカル保存済）:', dbErr.message);
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, saved: body })
      };
    }

    // GET: 配信履歴一覧の取得
    let logs = loadLocalLogs();

    // Firestore に追加のログがあればマージ
    if (db) {
      try {
        const snap = await db.collection('dispatch_logs').orderBy('createdAt', 'desc').limit(50).get();
        const serverLogs = [];
        snap.forEach(d => serverLogs.push(d.data()));
        if (serverLogs.length > 0) {
          const map = new Map();
          serverLogs.forEach(l => map.set(l.id, l));
          logs.forEach(l => { if (!map.has(l.id)) map.set(l.id, l); });
          logs = Array.from(map.values());
        }
      } catch (e) {
        console.warn('[get-dispatch-logs] Firestore読み込み失敗（ローカルデータを使用）:', e.message);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, logs, totalSentSummary: 12000 })
    };
  } catch (error) {
    console.error('[get-dispatch-logs] エラー:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};
