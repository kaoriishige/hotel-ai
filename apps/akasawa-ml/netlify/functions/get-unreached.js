const fs = require('fs');
const path = require('path');

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
    let undeliveredList = [];

    // 1. 同梱された undelivered_raw.json の探索
    const candidatePaths = [
      path.join(__dirname, 'data', 'undelivered_raw.json'),
      path.join(__dirname, 'undelivered_raw.json'),
      path.join(__dirname, '..', '..', 'public', 'data', 'undelivered_raw.json'),
      path.join(__dirname, '..', '..', '..', 'scratch', 'undelivered_raw.json'),
      path.join(process.cwd(), 'apps', 'akasawa-ml', 'public', 'data', 'undelivered_raw.json'),
      path.join(process.cwd(), 'scratch', 'undelivered_raw.json')
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            undeliveredList = parsed;
            console.log(`[get-unreached] バウンスデータを読み込みました: ${p} (${undeliveredList.length}件)`);
            break;
          }
        } catch (e) {
          console.warn(`[get-unreached] ${p} の読み込みエラー:`, e.message);
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        source: 'persistent_storage',
        totalEmails: 12000,
        undeliveredCount: undeliveredList.length,
        data: undeliveredList
      })
    };
  } catch (error) {
    console.error('[get-unreached] エラー:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};
