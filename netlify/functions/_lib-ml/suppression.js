const fs = require('fs');
const path = require('path');

let getDb = null;
try {
  getDb = require('../_lib-endo/firebase-admin').getDb;
} catch (e1) {
  try {
    getDb = require('../_lib/firebase-admin').getDb;
  } catch (e2) {}
}

// Firestore読み取りクォータ消費を抑えるためのコンテナ内キャッシュ（60秒）
let cachedFirestoreOptouts = [];
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

/**
 * オプトアウトおよびバウンス（不達）の抑制リストを読み込む。
 * ローカル同梱JSONに加え、Firestoreのoptoutsコレクションも参照する。
 */
async function getSuppressedEmails() {
  const optouts = new Set();
  const bounces = new Set();
  const dataDir = path.join(__dirname, '..', 'data');

  try {
    const optPath = path.join(dataDir, 'optouts.json');
    if (fs.existsSync(optPath)) {
      const list = JSON.parse(fs.readFileSync(optPath, 'utf8') || '[]');
      list.forEach(item => {
        if (item.email) optouts.add(String(item.email).trim().toLowerCase());
      });
    }
  } catch (e) {}

  try {
    const bouncePath = path.join(dataDir, 'undelivered_raw.json');
    if (fs.existsSync(bouncePath)) {
      const list = JSON.parse(fs.readFileSync(bouncePath, 'utf8') || '[]');
      list.forEach(item => {
        const em = item.email || item.recipient || item.to;
        if (em) bounces.add(String(em).trim().toLowerCase());
      });
    }
  } catch (e) {}

  const now = Date.now();
  if (now - cachedAt < CACHE_TTL_MS && cachedFirestoreOptouts.length > 0) {
    cachedFirestoreOptouts.forEach(em => optouts.add(em));
    return { optouts, bounces };
  }

  if (getDb) {
    try {
      const db = getDb();
      const snap = await db.collection('optouts').limit(500).get();
      const fetched = [];
      snap.forEach(doc => {
        const d = doc.data();
        if (d && d.email) {
          const clean = String(d.email).trim().toLowerCase();
          if (clean) {
            fetched.push(clean);
            optouts.add(clean);
          }
        }
      });
      cachedFirestoreOptouts = fetched;
      cachedAt = now;
    } catch (err) {
      console.warn('[suppression] Firestore optouts読み込み失敗（ローカルキャッシュで継続）:', err.message);
      cachedFirestoreOptouts.forEach(em => optouts.add(em));
    }
  }

  return { optouts, bounces };
}

module.exports = { getSuppressedEmails };
