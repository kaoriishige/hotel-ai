exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  try {
    let { payloads, channel, scenario } = JSON.parse(event.body || '{}');
    if (!payloads || !Array.isArray(payloads) || payloads.length === 0) {
      return json(400, { ok: false, error: 'payloads array is required' });
    }
    if (payloads.length > 100) {
      return json(400, { ok: false, error: 'max 100 payloads per batch request allowed' });
    }

    // === 宛先重複排除 (同一メールアドレスまたはLINE IDへの多重送信を防止) ===
    const seenEmails = new Set();
    const seenLineUsers = new Set();
    const uniquePayloads = [];

    payloads.forEach(p => {
      let isDuplicate = false;
      if (channel === 'email' || channel === 'both') {
        if (p.email) {
          const cleanEmail = String(p.email).trim().toLowerCase();
          if (seenEmails.has(cleanEmail)) {
            isDuplicate = true;
          } else {
            seenEmails.add(cleanEmail);
          }
        }
      }
      if (channel === 'line' || channel === 'both') {
        if (p.lineUserId) {
          const cleanLine = String(p.lineUserId).trim();
          if (seenLineUsers.has(cleanLine)) {
            isDuplicate = true;
          } else {
            seenLineUsers.add(cleanLine);
          }
        }
      }
      if (!isDuplicate) {
        uniquePayloads.push(p);
      }
    });
    payloads = uniquePayloads;

    // === 事前バリデーション (予測可能なエラーがある場合は、Resend送信を含め1件も送信せずに手前で即時エラー終了する) ===
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const apiKeys = getResendApiKeys();
    const from = process.env.MAIL_FROM;
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if ((channel === 'email' || channel === 'both') && (apiKeys.length === 0 || !from)) {
      return json(400, { ok: false, error: 'メール配信用APIキー(RESEND_API_KEYS1〜5)または送信元アドレス(MAIL_FROM)が設定されていません。送信処理は一切開始されていません。' });
    }
    if ((channel === 'line' || channel === 'both') && !lineToken) {
      return json(400, { ok: false, error: 'LINE配信用のアクセストークン(LINE_CHANNEL_ACCESS_TOKEN)が設定されていません。送信処理は一切開始されていません。' });
    }

    const invalidEmails = [];
    const invalidLineUsers = [];
    const invalidMessages = [];
    const invalidSubjects = [];

    payloads.forEach((p, idx) => {
      const name = p.customerName || `No.${idx + 1}`;

      // メッセージ本文の検証
      if (!p.message || String(p.message).trim() === '') {
        invalidMessages.push(`・${name}: メッセージ本文が空欄です`);
      }

      if (channel === 'email' || channel === 'both') {
        // メール件名の検証
        if (!p.subject || String(p.subject).trim() === '') {
          invalidSubjects.push(`・${name}: メールの件名が空欄です`);
        }
        if (!p.email) {
          invalidEmails.push(`・${name}: メールアドレスが空欄です`);
        } else {
          const cleanEmail = String(p.email).trim();
          const isFormatValid = emailRegex.test(cleanEmail);
          const hasRfcViolation = cleanEmail.includes('..') || cleanEmail.includes('.@');
          if (!isFormatValid || hasRfcViolation) {
            invalidEmails.push(`・${name}: ${p.email} (無効またはRFC規格違反)`);
          }
        }
      }
      if (channel === 'line' || channel === 'both') {
        if (!p.lineUserId) {
          invalidLineUsers.push(`・${name}: LINE IDが設定されていません`);
        }
      }
    });

    if (invalidEmails.length > 0 || invalidLineUsers.length > 0 || invalidMessages.length > 0 || invalidSubjects.length > 0) {
      const errors = [...invalidEmails, ...invalidLineUsers, ...invalidMessages, ...invalidSubjects];
      return json(400, { 
        ok: false, 
        error: '送信先リストまたはメッセージ内容に不備があるため、送信処理を一切行わずに中断しました。該当箇所を修正してください。',
        details: errors.join('\n')
      });
    }
    // === 事前バリデーション終了 ===

    const results = {};
    let hasErrors = false;

    if (channel === 'email' || channel === 'both') {
      try {
        const emailRes = await sendEmailBatch(payloads);
        results.email = emailRes;
        if (emailRes.failedNames && emailRes.failedNames.length > 0) {
          hasErrors = true;
        }
      } catch (err) {
        results.email = { status: 'failed', error: err.message };
        hasErrors = true;
      }
    }
    if (channel === 'line' || channel === 'both') {
      try {
        const lineRes = await sendLineBatch(payloads);
        results.line = lineRes;
        if (lineRes.failedNames && lineRes.failedNames.length > 0) {
          hasErrors = true;
        }
      } catch (err) {
        results.line = { status: 'failed', error: err.message };
        hasErrors = true;
      }
    }

    // 処理自体は完了したため200を返し、各チャネルの成否と詳細をresultsオブジェクトに入れて応答する
    return json(200, { ok: true, scenario, channel, results, hasErrors, mode: runtimeMode() });
  } catch (error) {
    return json(500, { ok: false, error: error.message, mode: runtimeMode() });
  }
};

function getResendApiKeys() {
  const keys = [];
  // 一括配信・スケジュール配信は RESEND_API_KEYS2〜 (各キー100件/日) を使用
  for (let i = 2; i <= 10; i++) {
    const k = process.env[`RESEND_API_KEYS${i}`] || process.env[`RESEND_API_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  // 万が一2以降が未設定の場合はKey 1へフォールバック
  if (keys.length === 0) {
    const k1 = process.env.RESEND_API_KEYS1 || process.env.RESEND_API_KEY_1 || process.env.RESEND_API_KEY;
    if (k1 && k1.trim()) keys.push(k1.trim());
  }
  return [...new Set(keys)];
}

async function sendEmailBatch(payloads) {
  // 英数字・主要記号のみを許可する厳格なメールアドレス正規表現
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  const validPayloads = payloads.filter(p => {
    if (!p.email) return false;
    const cleanEmail = String(p.email).trim();
    
    // 1. 厳格な書式チェック
    if (!emailRegex.test(cleanEmail)) return false;
    // 2. 日本の古いキャリアメール等に多いRFC違反（ドット連続「..」や@直前のドット「.@」）を排除
    if (cleanEmail.includes('..') || cleanEmail.includes('.@')) return false;
    
    return true;
  });

  const skippedNames = payloads.filter(p => {
    if (!p.email) return true;
    const cleanEmail = String(p.email).trim();
    const isFormatValid = emailRegex.test(cleanEmail);
    const hasRfcViolation = cleanEmail.includes('..') || cleanEmail.includes('.@');
    return !isFormatValid || hasRfcViolation;
  }).map(p => {
    return `${p.customerName || '宛名なし'} (無効またはRFC違反アドレス: ${p.email || '空欄'})`;
  });

  const apiKeys = getResendApiKeys();
  const from = process.env.MAIL_FROM;

  console.log(`[sendEmailBatch] 送信要求: ${payloads.length}件, 有効: ${validPayloads.length}件, 利用可能APIキー数: ${apiKeys.length}個`);

  if (apiKeys.length === 0 || !from) {
    return { 
      type: 'email', 
      status: 'mock', 
      count: validPayloads.length,
      sample: validPayloads.slice(0, 2),
      skippedNames
    };
  }

  const batchRequests = validPayloads.map(p => {
    const cid = p.customerId || (p.email ? p.email.split('@')[0] : 'guest');
    const trackingPixelUrl = `https://hotel-ai.netlify.app/api/track-open?cid=${encodeURIComponent(cid)}&campaign=crm`;
    const htmlBody = (p.message || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>')
      .replace(/(https?:\/\/[^\s<]+)/g, (url) => {
        const trackingClickUrl = `https://hotel-ai.netlify.app/api/track-click?cid=${encodeURIComponent(cid)}&channel=email&url=${encodeURIComponent(url)}`;
        return `<a href="${trackingClickUrl}" target="_blank" style="color: #2563eb; text-decoration: underline;">${url}</a>`;
      })
      + `<br/><br/><img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;

    const req = {
      from,
      to: p.email,
      subject: p.subject,
      text: p.message,
      html: htmlBody
    };
    if (process.env.REPLY_TO) {
      req.reply_to = process.env.REPLY_TO;
    }
    return req;
  });

  if (batchRequests.length === 0) {
    return { type: 'email', status: 'skipped', reason: 'no valid emails in payload', skippedNames };
  }

  // 1つのAPIキーにつき100件まで送信。APIキー数×100件（5キーなら500件）を順次ローテーション送信
  const keyCapacity = 100;
  let keyIndex = 0;
  let sentCount = 0;
  const failedNames = [];
  const responsesData = [];
  const usedKeysSummary = [];

  for (let i = 0; i < batchRequests.length; i += keyCapacity) {
    if (keyIndex >= apiKeys.length) {
      // 利用可能なすべてのAPIキーの枠を使い切った場合
      const remainingUnsent = batchRequests.slice(i);
      remainingUnsent.forEach(r => {
        const matchingP = validPayloads.find(p => p.email === r.to);
        const name = matchingP ? (matchingP.customerName || r.to) : r.to;
        failedNames.push(`${name} (全APIキーの本日枠上限到達・次回送信対象)`);
      });
      break;
    }

    const currentKey = apiKeys[keyIndex];
    const chunkRequests = batchRequests.slice(i, i + keyCapacity);
    console.log(`[sendEmailBatch] APIキー #${keyIndex + 1} (${currentKey.substring(0, 8)}...) で ${chunkRequests.length} 件送信開始`);

    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(chunkRequests)
      });

      const data = await res.json();
      if (!res.ok) {
        console.error(`[sendEmailBatch] APIキー #${keyIndex + 1} 送信失敗:`, data);
        // レートリミット等の場合は次のキーで再試行
        keyIndex++;
        if (keyIndex < apiKeys.length) {
          i -= keyCapacity; // 同じチャンクを次のキーで再試行
          continue;
        } else {
          throw new Error(`Resend Batch API Error: ${JSON.stringify(data)}`);
        }
      }

      sentCount += chunkRequests.length;
      responsesData.push(data);
      usedKeysSummary.push({ keyNum: keyIndex + 1, count: chunkRequests.length });
      keyIndex++; // 次のチャンクは次のキーを使用
    } catch (err) {
      console.error(`[sendEmailBatch] APIキー #${keyIndex + 1} 例外発生:`, err.message);
      keyIndex++;
      if (keyIndex < apiKeys.length) {
        i -= keyCapacity; // 次のキーで再試行
      } else {
        throw err;
      }
    }
  }
  
  return { 
    type: 'email', 
    status: failedNames.length > 0 && sentCount === 0 ? 'failed' : 'sent', 
    provider: 'resend-multi-keys', 
    count: sentCount,
    usedKeys: usedKeysSummary,
    data: responsesData,
    skippedNames,
    failedNames
  };
}

async function sendLineBatch(payloads) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const validPayloads = payloads.filter(p => p.lineUserId);
  const skippedNames = payloads.filter(p => !p.lineUserId).map(p => `${p.customerName || '宛名なし'} (${p.email || '連絡先なし'})`);

  if (!token) {
    return { 
      type: 'line', 
      status: 'mock', 
      count: validPayloads.length,
      skippedNames
    };
  }

  if (validPayloads.length === 0) {
    return { type: 'line', status: 'skipped', reason: 'no valid lineUserIds in payload', skippedNames };
  }

  const results = [];
  const failedNames = [];
  for (const p of validPayloads) {
    try {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: p.lineUserId,
          messages: [{ type: 'text', text: p.message.slice(0, 4900) }]
        })
      });
      
      if (!res.ok) {
        const err = await res.text();
        results.push({ to: p.lineUserId, success: false, error: err });
        failedNames.push(`${p.customerName || '宛名なし'} (${p.lineUserId})`);
      } else {
        results.push({ to: p.lineUserId, success: true });
      }
    } catch (e) {
      results.push({ to: p.lineUserId, success: false, error: e.message });
      failedNames.push(`${p.customerName || '宛名なし'} (${p.lineUserId})`);
    }
  }

  const successCount = results.filter(r => r.success).length;
  if (successCount === 0 && results.length > 0) {
    throw new Error(`LINE batch send completely failed. First error: ${results[0].error}`);
  }

  return { type: 'line', status: 'sent', provider: 'line', count: successCount, total: results.length, details: results, skippedNames, failedNames };
}

function runtimeMode() {
  return getResendApiKeys().length > 0 || process.env.LINE_CHANNEL_ACCESS_TOKEN ? 'live_or_partial' : 'mock';
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}
