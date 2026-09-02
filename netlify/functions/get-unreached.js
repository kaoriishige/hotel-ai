const fs = require('fs');
const path = require('path');

let myFetch = typeof fetch !== 'undefined' ? fetch : null;
if (!myFetch) {
  try {
    myFetch = require('node-fetch');
  } catch (e) {
    // node-fetch がない場合のフォールバック
  }
}

function getResendApiKeys() {
  const keys = [];
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`RESEND_API_KEYS${i}`] || process.env[`RESEND_API_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  if (process.env.RESEND_API_KEYS) {
    const splitted = process.env.RESEND_API_KEYS.split(',').map(s => s.trim()).filter(Boolean);
    keys.push(...splitted);
  }
  return [...new Set(keys)];
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const apiKeys = getResendApiKeys();
    
    // 開発/デモ環境またはローカルに undelivered_raw.json がある場合のキャッシュ読み込み
    let cachedList = [];
    const rootRawPath = path.join(__dirname, '..', '..', '..', 'scratch', 'undelivered_raw.json');
    if (fs.existsSync(rootRawPath)) {
      try {
        cachedList = JSON.parse(fs.readFileSync(rootRawPath, 'utf8'));
      } catch (e) {}
    }

    if (apiKeys.length === 0) {
      // APIキーがない場合でもキャッシュがあれば返す
      if (cachedList.length > 0) {
        return json(200, { ok: true, source: 'cache', data: cachedList });
      }
      return json(400, { ok: false, error: 'RESEND_API_KEYS1〜5 is not configured in .env' });
    }

    // Resend API から直近のメールログを取得
    if (!myFetch) {
      if (cachedList.length > 0) {
        return json(200, { ok: true, source: 'cache', data: cachedList });
      }
      return json(500, { ok: false, error: 'fetch function is not available' });
    }

    let emails = [];
    for (const key of apiKeys) {
      let hasMore = true;
      let after = null;
      const maxEmailsPerKey = 1000;
      let keyEmailsCount = 0;

      while (hasMore && keyEmailsCount < maxEmailsPerKey) {
        let url = 'https://api.resend.com/emails?limit=100';
        if (after) {
          url += `&after=${after}`;
        }

        try {
          const res = await myFetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json'
            }
          });

          if (!res.ok) {
            console.warn(`Resend API fetch failed for a key: ${res.status}`);
            break;
          }

          const result = await res.json();
          if (!result.data || !Array.isArray(result.data)) {
            break;
          }

          emails = emails.concat(result.data);
          keyEmailsCount += result.data.length;
          hasMore = result.has_more;

          if (hasMore && result.data.length > 0) {
            after = result.data[result.data.length - 1].id;
            await new Promise(r => setTimeout(r, 100));
          } else {
            break;
          }
        } catch (fetchErr) {
          console.warn('Resend log fetch error:', fetchErr.message);
          break;
        }
      }
    }

    // 重複IDの排除
    const seenLogIds = new Set();
    emails = emails.filter(item => {
      if (seenLogIds.has(item.id)) return false;
      seenLogIds.add(item.id);
      return true;
    });

    // 未到着（bounced / suppressed / failed / last_event != delivered）の抽出
    const undeliveredList = [];
    emails.forEach(item => {
      const status = item.last_event || 'unknown';
      if (status !== 'delivered') {
        const toStr = Array.isArray(item.to) ? item.to.join(', ') : item.to;
        undeliveredList.push({
          id: item.id,
          to: toStr,
          status: status,
          subject: item.subject || '',
          created_at: item.created_at,
          from: item.from
        });
      }
    });

    return json(200, {
      ok: true,
      source: 'api',
      totalEmails: emails.length,
      undeliveredCount: undeliveredList.length,
      data: undeliveredList
    });

  } catch (error) {
    return json(500, { ok: false, error: error.message });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(body)
  };
}
