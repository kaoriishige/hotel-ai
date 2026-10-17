const fs = require('fs');
const path = require('path');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

// オプトアウトおよびバウンス（不達）の抑制リスト読み込み
function getSuppressedEmails() {
  const optouts = new Set();
  const bounces = new Set();

  try {
    const optPath = path.join(__dirname, 'data', 'optouts.json');
    if (fs.existsSync(optPath)) {
      const list = JSON.parse(fs.readFileSync(optPath, 'utf8') || '[]');
      list.forEach(item => {
        if (item.email) optouts.add(String(item.email).trim().toLowerCase());
      });
    }
  } catch (e) {}

  try {
    const bouncePath = path.join(__dirname, 'data', 'undelivered_raw.json');
    if (fs.existsSync(bouncePath)) {
      const list = JSON.parse(fs.readFileSync(bouncePath, 'utf8') || '[]');
      list.forEach(item => {
        const em = item.email || item.recipient || item.to;
        if (em) bounces.add(String(em).trim().toLowerCase());
      });
    }
  } catch (e) {}

  return { optouts, bounces };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const { customer, scenario, channel, subject, message } = JSON.parse(event.body || '{}');
    if (!customer) return json(400, { ok: false, error: 'customer is required' });

    // 顧客オブジェクト自体に unsubscribed フラグがある場合
    if (customer.unsubscribed) {
      return json(200, {
        ok: true,
        scenario,
        channel,
        results: {
          email: { type: 'email', status: 'skipped', reason: '配信停止（オプトアウト）済みの顧客のため送信を遮断しました' }
        },
        mode: runtimeMode()
      });
    }

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

function getSesClient() {
  const accessKeyId = (
    process.env.SES_ACCESS_KEY ||
    process.env.SES_AWS_ACCESS_KEY ||
    process.env.AWS_ACCESS_KEY ||
    ''
  ).trim();

  const secretAccessKey = (
    process.env.SES_SECRET_KEY ||
    process.env.SES_AWS_SECRET_KEY ||
    process.env.AWS_SECRET_KEY ||
    ''
  ).trim();

  const region = (
    process.env.SES_REGION ||
    process.env.SES_AWS_REGION ||
    process.env.AWS_REGION_KEY ||
    'ap-northeast-1'
  ).trim();

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  return new SESClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

async function sendEmail(customer, subject, message) {
  if (!customer.email) return { type: 'email', status: 'skipped', reason: 'email missing' };

  const cleanEmail = String(customer.email).trim().toLowerCase();
  const { optouts, bounces } = getSuppressedEmails();

  // === 【安全ガード1】オプトアウト済みの宛先への送信をサーバー側で完全遮断 ===
  if (optouts.has(cleanEmail)) {
    console.warn(`[dispatch:BLOCKED] オプトアウト済みの宛先への送信を遮断しました: ${cleanEmail}`);
    return {
      type: 'email',
      status: 'skipped',
      reason: '【送信遮断】配信停止（オプトアウト）希望済みアドレスのため、送信を行いませんでした',
      to: cleanEmail
    };
  }

  // === 【安全ガード2】過去バウンス（不達）宛先への送信をサーバー側で完全遮断 ===
  if (bounces.has(cleanEmail)) {
    console.warn(`[dispatch:BLOCKED] 過去バウンス（不達）アドレスへの送信を遮断しました: ${cleanEmail}`);
    return {
      type: 'email',
      status: 'skipped',
      reason: '【送信遮断】過去に不達（バウンス）となった無効アドレスのため、送信を行いませんでした',
      to: cleanEmail
    };
  }

  const sesClient = getSesClient();
  const senderEmail = (process.env.SENDER_EMAIL || process.env.MAIL_FROM || '').trim();

  if (!sesClient || !senderEmail) {
    return {
      type: 'email',
      status: 'mock',
      to: customer.email,
      subject,
      note: '環境変数(AWS_ACCESS_KEY / AWS_SECRET_KEY / SENDER_EMAIL)未設定のためモック送信'
    };
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

  const sendEmailParams = {
    Source: senderEmail,
    Destination: {
      ToAddresses: [customer.email.trim()]
    },
    Message: {
      Subject: {
        Data: subject || '赤沢温泉旅館からのお知らせ',
        Charset: 'UTF-8'
      },
      Body: {
        Text: {
          Data: message || '',
          Charset: 'UTF-8'
        },
        Html: {
          Data: htmlBody,
          Charset: 'UTF-8'
        }
      }
    }
  };

  if (process.env.REPLY_TO) {
    sendEmailParams.ReplyToAddresses = [process.env.REPLY_TO.trim()];
  }

  try {
    const command = new SendEmailCommand(sendEmailParams);
    const response = await sesClient.send(command);

    return {
      type: 'email',
      status: 'sent',
      to: customer.email,
      provider: 'amazon-ses',
      messageId: response.MessageId,
      response
    };
  } catch (err) {
    console.error('Amazon SES 送信エラー:', err);
    throw new Error(`Amazon SES 送信エラー: ${err.message}`);
  }
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
  const hasAws = (process.env.SES_ACCESS_KEY || process.env.SES_AWS_ACCESS_KEY || process.env.AWS_ACCESS_KEY) &&
                 (process.env.SES_SECRET_KEY || process.env.SES_AWS_SECRET_KEY || process.env.AWS_SECRET_KEY);
  return hasAws || process.env.LINE_CHANNEL_ACCESS_TOKEN ? 'live_or_partial' : 'mock';
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}
