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

const LOCAL_OPTOUTS_FILE = path.join(__dirname, 'data', 'optouts.json');
const PUBLIC_OPTOUTS_FILE = path.join(__dirname, '..', '..', 'public', 'data', 'optouts.json');

function loadLocalOptouts() {
  const map = new Map();
  [LOCAL_OPTOUTS_FILE, PUBLIC_OPTOUTS_FILE].forEach(file => {
    if (fs.existsSync(file)) {
      try {
        const list = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Array.isArray(list)) {
          list.forEach(item => {
            const k = (item.email || item.cid || item.id || '').toLowerCase();
            if (k) map.set(k, item);
          });
        }
      } catch (e) {}
    }
  });
  return Array.from(map.values());
}

function saveLocalOptouts(list) {
  [LOCAL_OPTOUTS_FILE, PUBLIC_OPTOUTS_FILE].forEach(file => {
    try {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
    } catch (e) {
      console.warn('[unsubscribe] optouts保存警告:', file, e.message);
    }
  });
}

exports.handler = async (event) => {
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
    const action = body.action || 'unsubscribe'; // 'unsubscribe' | 'resubscribe' | 'list'
    const email = (body.email || '').trim().toLowerCase();
    const cid = (body.cid || '').trim();
    const reason = (body.reason || 'ユーザーによる配信停止手続き').trim();

    let db = null;
    try {
      if (getDb) db = getDb();
    } catch (e) {
      console.warn('[unsubscribe] Firestore getDb unavailable:', e.message);
    }

    // === 1. 配信停止リスト取得 (action: 'list') ===
    if (action === 'list') {
      const combinedMap = new Map();

      // ローカル保存ファイルから取得
      const localList = loadLocalOptouts();
      localList.forEach(item => {
        const k = (item.email || item.cid || item.id || '').toLowerCase();
        if (k) combinedMap.set(k, item);
      });

      // Firestore から取得（クォータ制限時は安全にスキップ）
      if (db) {
        try {
          const snap = await db.collection('optouts').limit(500).get();
          snap.forEach(doc => {
            const d = doc.data();
            const k = (d.email || d.cid || doc.id).toLowerCase();
            if (k) combinedMap.set(k, { id: doc.id, ...d });
          });
        } catch (dbErr) {
          console.warn('[unsubscribe] Firestore読み込み失敗（ローカルキャッシュ使用）:', dbErr.message);
        }
      }

      const list = Array.from(combinedMap.values());
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, optouts: list, count: list.length })
      };
    }

    // === 2. 配信停止を解除・復活 (action: 'resubscribe') ===
    if (action === 'resubscribe') {
      if (!email && !cid) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'email または cid が必要です' }) };
      }

      // ローカルから削除
      let localList = loadLocalOptouts();
      localList = localList.filter(item => {
        const iEm = (item.email || '').toLowerCase();
        const iCid = item.cid || '';
        if (email && iEm === email) return false;
        if (cid && iCid === cid) return false;
        return true;
      });
      saveLocalOptouts(localList);

      // Firestore から削除（可能な場合）
      if (db) {
        try {
          const snap = await db.collection('optouts').get();
          const deletePromises = [];
          snap.forEach(doc => {
            const d = doc.data();
            const dEm = (d.email || '').toLowerCase();
            const dCid = (d.cid || '').trim();
            if ((email && dEm === email) || (cid && dCid === cid)) {
              deletePromises.push(doc.ref.delete());
            }
          });
          await Promise.all(deletePromises);
        } catch (dbErr) {
          console.warn('[unsubscribe] Firestore削除エラー（ローカルでは解除済）:', dbErr.message);
        }
      }

      console.log(`[unsubscribe] 配信復活完了: Email=${email}, CID=${cid}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, message: '配信停止を解除し、配信を復活させました', email, cid })
      };
    }

    // === 3. 配信停止登録 (action: 'unsubscribe' | 'add') ===
    const inputEmails = Array.isArray(body.emails) ? body.emails : (email ? [email] : []);
    if (inputEmails.length === 0 && !cid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'email または cid が必要です' })
      };
    }

    const localList = loadLocalOptouts();
    const addedList = [];

    if (inputEmails.length > 0) {
      inputEmails.forEach(emStr => {
        const cleanEm = String(emStr).trim().toLowerCase();
        if (!cleanEm) return;
        const optOutRecord = {
          id: `optout_${Buffer.from(cleanEm).toString('hex').slice(0, 32)}`,
          email: cleanEm,
          cid: cid || null,
          reason,
          unsubscribedAt: new Date().toISOString(),
          userAgent: event.headers['user-agent'] || '',
          ip: event.headers['client-ip'] || event.headers['x-forwarded-for'] || ''
        };

        const existingIdx = localList.findIndex(item => (item.email || '').toLowerCase() === cleanEm);
        if (existingIdx >= 0) {
          localList[existingIdx] = { ...localList[existingIdx], ...optOutRecord };
        } else {
          localList.push(optOutRecord);
        }
        addedList.push(optOutRecord);

        // Firestore に保存（可能な場合）
        if (db && admin) {
          try {
            db.collection('optouts').doc(optOutRecord.id).set({
              ...optOutRecord,
              timestamp: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true }).catch(() => {});
          } catch (e) {}
        }
      });
    } else if (cid) {
      const optOutRecord = {
        id: `optout_cid_${cid}`,
        email: null,
        cid: cid,
        reason,
        unsubscribedAt: new Date().toISOString(),
        userAgent: event.headers['user-agent'] || '',
        ip: event.headers['client-ip'] || event.headers['x-forwarded-for'] || ''
      };
      const existingIdx = localList.findIndex(item => item.cid === cid);
      if (existingIdx >= 0) {
        localList[existingIdx] = { ...localList[existingIdx], ...optOutRecord };
      } else {
        localList.push(optOutRecord);
      }
      addedList.push(optOutRecord);
    }

    saveLocalOptouts(localList);

    console.log(`[unsubscribe] 配信停止受付完了: count=${addedList.length}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: `${addedList.length} 件の配信停止（オプトアウト）を登録しました`,
        added: addedList
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
