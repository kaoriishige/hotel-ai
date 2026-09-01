exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const { customer, scenario, channel, subject, message } = JSON.parse(event.body || '{}');
    if (!customer) return json(400, { ok: false, error: 'customer is required' });

    const results = {};
    if (channel === 'email' || channel === 'both') {
      results.email = await sendEmail(customer, subject, message);
    }
    if (channel === 'line' || channel === 'both') {
      results.line = await sendLine(customer, message);
    }

    return json(200, { ok: true, scenario, channel, results, mode: runtimeMode() });
  } catch (error) {
    return json(500, { ok: false, error: error.message, mode: runtimeMode() });
  }
};

function getIndividualResendApiKeys() {
  const keys = [];
  // 個別配信専用キー: RESEND_API_KEYS1 を最優先
  const key1 = process.env.RESEND_API_KEYS1 || process.env.RESEND_API_KEY_1 || process.env.RESEND_API_KEY;
  if (key1 && key1.trim()) {
    keys.push(key1.trim());
  }
  // バックアップ・フェイルオーバー用キー（2〜6）
  for (let i = 2; i <= 6; i++) {
    const k = process.env[`RESEND_API_KEYS${i}`] || process.env[`RESEND_API_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  return [...new Set(keys)];
}

async function sendEmail(customer, subject, message) {
  if (!customer.email) return { type: 'email', status: 'skipped', reason: 'email missing' };

  const apiKeys = getIndividualResendApiKeys();
  const from = process.env.MAIL_FROM;
  if (apiKeys.length === 0 || !from) {
    return { type: 'email', status: 'mock', to: customer.email, subject, note: '環境変数(RESEND_API_KEYS / MAIL_FROM)未設定のためモック送信' };
  }

  const cid = customer.customerId || customer.id || (customer.email ? customer.email.split('@')[0] : 'guest');
  const trackingPixelUrl = `https://hotel-ai.netlify.app/api/track-open?cid=${encodeURIComponent(cid)}&campaign=crm`;
  
  // 本文中のURLを自動的にクリック追跡URL（/api/track-click）に変換
  const htmlBody = (message || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
    .replace(/(https?:\/\/[^\s<]+)/g, (url) => {
      const trackingClickUrl = `https://hotel-ai.netlify.app/api/track-click?cid=${encodeURIComponent(cid)}&channel=email&url=${encodeURIComponent(url)}`;
      return `<a href="${trackingClickUrl}" target="_blank" style="color: #2563eb; text-decoration: underline;">${url}</a>`;
    })
    + `<br/><br/><img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;

  const payload = {
    from,
    to: customer.email,
    subject,
    text: message,
    html: htmlBody
  };

  if (process.env.REPLY_TO) {
    payload.reply_to = process.env.REPLY_TO;
  }

  let lastError = null;
  for (let i = 0; i < apiKeys.length; i++) {
    const currentKey = apiKeys[i];
    try {
      const resendController = new AbortController();
      const resendTimeout = setTimeout(() => resendController.abort(), 8000);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentKey}`,
          'Content-Type': 'application/json'
        },
        signal: resendController.signal,
        body: JSON.stringify(payload)
      });
      clearTimeout(resendTimeout);

      const data = await res.json();
      if (!res.ok) {
        lastError = new Error(`Resend APIエラー (Key #${i + 1}): ${data.message || JSON.stringify(data)}`);
        continue; // 次のキーで再試行
      }
      return { 
        type: 'email', 
        status: 'sent', 
        to: customer.email, 
        provider: 'resend', 
        keyNum: i + 1, 
        emailId: data.id, 
        data 
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('すべてのResend APIキーで送信に失敗しました');
}

async function sendLine(customer, message) {
  if (!customer.lineUserId) return { type: 'line', status: 'skipped', reason: 'lineUserId missing' };

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return { type: 'line', status: 'mock', to: customer.lineUserId };
  }

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: customer.lineUserId,
      messages: [{ type: 'text', text: message.slice(0, 4900) }]
    })
  });

  if (!res.ok) {
    const data = await res.text();
    throw new Error(`LINE send failed: ${data}`);
  }
  return { type: 'line', status: 'sent', to: customer.lineUserId, provider: 'line' };
}

function runtimeMode() {
  return getIndividualResendApiKeys().length > 0 || process.env.LINE_CHANNEL_ACCESS_TOKEN ? 'live_or_partial' : 'mock';
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}
