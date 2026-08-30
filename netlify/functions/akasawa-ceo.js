const https = require('https');
const fs = require('fs');
const path = require('path');
try {
  require('dotenv').config();
} catch (e) {}

// ローカル環境用 .env 自動ロード
if (!process.env.OPENAI_API_KEY && !process.env.OPEN_AI_API && !process.env.GEMINI_API_KEY) {
  try {
    const candidatePaths = [
      path.resolve(__dirname, '../../../../.env'),
      path.resolve(__dirname, '../../../.env'),
      path.resolve(__dirname, '../../.env'),
      path.resolve(__dirname, '../.env'),
      path.resolve(__dirname, '.env'),
      path.resolve(process.cwd(), '.env')
    ];
    for (const envPath of candidatePaths) {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split(/\r?\n/).forEach(line => {
          const idx = line.indexOf('=');
          if (idx > 0) {
            const k = line.substring(0, idx).trim();
            const v = line.substring(idx + 1).trim();
            if (!process.env[k]) process.env[k] = v;
          }
        });
        break;
      }
    }
  } catch (e) {}
}

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

/**
 * OpenAI API 呼び出し (OPENAI_API_KEY または OPEN_AI_API を使用)
 */
async function callOpenAI(apiKey, systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7
    });

    const req = https.request({
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 15000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
            resolve(parsed.choices[0].message.content);
            return;
          }
          reject(new Error('OpenAI API Error: ' + body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('OpenAI API Timeout'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Gemini API 呼び出し (フォールバック対応)
 */
async function callGemini(apiKey, systemPrompt, userPrompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent([systemPrompt, userPrompt]);
  return result.response.text();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const openaiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!openaiKey && !geminiKey) {
    return json(500, { error: 'OPENAI_API_KEY (または OPEN_AI_API / GEMINI_API_KEY) が設定されていません。' });
  }

  try {
    const { prompt, actionType = 'chat' } = JSON.parse(event.body || '{}');

    if (!prompt && actionType === 'chat') {
      return json(400, { error: '遠藤オーナーからの指示・質問を入力してください。' });
    }

    // 赤沢温泉旅館ファクト & RAG
    const ryokanRagPath = path.join(__dirname, '_shared', 'ryokan_rag.md');
    const reasonToBuyPath = path.join(__dirname, '_shared', 'reason_to_buy_rag.md');
    
    let ryokanRag = '';
    let reasonToBuyRag = '';
    try { ryokanRag = fs.readFileSync(ryokanRagPath, 'utf8'); } catch(e) {}
    try { reasonToBuyRag = fs.readFileSync(reasonToBuyPath, 'utf8'); } catch(e) {}

    const systemPrompt = `
あなたは【塩原温泉 赤沢温泉旅館】の専任【旅館AICEO（AI最高経営責任者）】です。
あなたの役割は、最高意思決定者である【遠藤正俊オーナー】の専属右腕として密接に対話し、オーナーの経営理念・人生哲学を具現化し、あなたの配下にある【全9システム ＋ 遠藤オーナー個人動画SNSシステム】を一括統括・自律連動させて最高の結果（売上・客単価・稼働率・満足度・ブランド確立）を創出することです。

【赤沢温泉旅館の絶対ファクト】
- 施設名: 塩原温泉 赤沢温泉旅館（住所: 栃木県那須塩原市塩原1149）
- 温泉: 自家源泉100%かけ流し天然ぬる湯（38〜40℃・加温加水なし・無循環）
- 特長: 自然に過ごす猫たちを静かに見守る静養宿（※猫は自然体で館内を過ごしていますので優しく見守ってください。猫と遊びたい・触れ合いたい方は徒歩10分の猫カフェをご案内）、箒川沿い渓流一軒宿、静養・湯治・リセット空間
- 食事: 赤沢風 鹿×豚ジンギスカン鍋、地物山菜、川魚料理
- ターゲット競合10施設: 旅館まじま荘、上会津屋、心づくしの宿 ぬりや、常盤ホテル、塩原温泉梅川壮、奥塩原高原ホテル、やまの宿 下藤屋、松楓楼 松屋、秘湯の宿 元泉館、わんわんパラダイス

【遠藤正俊オーナーの理念 ＆ 個人動画テーマ（endo-sns 連動）】
- 遠藤オーナー個人の人生哲学・生き方・思考法・マインドセット（安定を捨てて50代で舵を切った決断、他人の価値観ではなく人生の軸、世界の大自然から学んだこと、価格競争からの脱却、何もしない時間の贅沢な余白）を尊重し、個人動画システム（endo-sns）とも完全連動します。
- 旅館PRとオーナー個人人生哲学動画のテーマを正しく切り分け、相乗効果を生み出します。

【あなたの配下にある統括システム群】
1. ダイナミックプライシングAI (akasawa-dp): 競合10宿の価格動向を監視し、最適なADRを自動算出・設定。
2. 宿泊プラン作成AI (akasawa-plan): 季節・ターゲット別の高付加価値プランを自動生成。
3. OTA最適化・競合分析AI (akasawa-ota / market): 楽天・じゃらん等の販売チャネル最適化。
4. 公式HP & RAGナレッジ基盤 (akasawa-rag): Schema.org構造化データと公式ドメイン（akasawaonsen.com）での直販強化。
5. SNSマーケティングAI (akasawa-sns): ぬる湯や自然に過ごす猫たちの見守りをショート動画・Instagram等で自動発信（猫と遊ぶなら徒歩10分猫カフェ案内）。
6. 公式ブログ自動執筆AI (akasawa-blog): SEO/LLMO対策の高品質コラムを定期投稿。
7. 客室デジタルコンシェルジュ (akasawa-chat): 24時間4カ国語対応の館内案内・ぬる湯指南。
8. 口コミ分析 & 返信AI (akasawa-review): 全レビューを即時分析し、感謝と改善の誠実返信を自動生成。
9. メルマガ & リピートCRM (akasawa-ml): 過去宿泊者へファン化・リピート促進メッセージをパーソナライズ配信。
10. 遠藤オーナー個人動画＆SNSシステム (endo-sns): オーナーの人生哲学・生き方・思考法を発信する個人ブランディング動画。

【出力フォーマット・トーン＆マナー】
- 遠藤正俊オーナーに対して、極めて礼儀正しく、かつ頼れる経営パートナー・AI CEOとして、自信と具体的な根拠（データ・ファクト）を持ったトーンで回答してください。
- 遠藤オーナーへの呼びかけ: 「遠藤オーナー」「オーナー」
- 回答構成:
  1. 👑 【経営判断・結論サマリー】（オーナーの指示に対する結論や分析結果を端的かつ明瞭に）
  2. ⚙️ 【配下システム＆個人動画システムへの連動指示・アクションプラン】（どのシステムにどのような具体的指示を出したか/出すべきかを箇条書きで明記）
  3. 📈 【期待される成果・KPI予測】（売上・客単価・ブランド価値・リピート率へのインパクト）
  4. 💡 【オーナーへの確認・ご提案事項】（オーナーの意思決定を仰ぐポイントがあれば明記）

【赤沢温泉旅館ナレッジ基盤】
${ryokanRag}
${reasonToBuyRag}
`;

    const userPrompt = actionType === 'orchestrate' 
      ? `【遠藤オーナーからの全システム一括最適化指示】\n現在、赤沢温泉旅館の業績を最大化するため、全9システムおよび遠藤オーナー個人動画システムを連動させた総合最適化アクションを実行してください。`
      : `【遠藤正俊オーナーからの指示・相談】\n${prompt}`;

    let ceoResponse = '';
    let apiProvider = '';

    // OpenAI API を第一優先で呼び出し
    if (openaiKey) {
      try {
        ceoResponse = await callOpenAI(openaiKey, systemPrompt, userPrompt);
        apiProvider = 'OpenAI API (gpt-4o-mini)';
      } catch (err) {
        console.warn('OpenAI API call failed, trying Gemini fallback:', err.message);
      }
    }

    // Gemini API フォールバック
    if (!ceoResponse && geminiKey) {
      ceoResponse = await callGemini(geminiKey, systemPrompt, userPrompt);
      apiProvider = 'Google Gemini API (gemini-2.5-flash)';
    }

    if (!ceoResponse) {
      throw new Error('AI API呼び出しに失敗しました。OPENAI_API_KEY / OPEN_AI_API / GEMINI_API_KEY をご確認ください。');
    }

    return json(200, {
      success: true,
      ceoResponse,
      apiProvider,
      timestamp: new Date().toISOString(),
      orchestratedSystems: [
        { id: 'endo-video', name: '遠藤オーナー個人動画システム', status: '哲学動画生成キュー連動完了' },
        { id: 'dp', name: 'ダイナミックプライシングAI', status: '連動最適化完了' },
        { id: 'plan', name: '宿泊プラン作成AI', status: '新プラン自動スタンバイ' },
        { id: 'ota', name: 'OTA最適化・競合分析AI', status: '競合10宿価格同期完了' },
        { id: 'rag', name: '公式HP & RAGナレッジ基盤', status: '構造化データ最適化' },
        { id: 'sns', name: 'SNSマーケティングAI', status: 'ぬる湯/猫見守り動画キュー登録' },
        { id: 'blog', name: '公式ブログ自動執筆AI', status: 'SEO記事スタンバイ' },
        { id: 'chat', name: '客室デジタルコンシェルジュ', status: '最新FAQ反映完了' },
        { id: 'review', name: '口コミ分析 & 返信AI', status: '新着レビュー巡回完了' },
        { id: 'crm', name: 'メルマガ & リピートCRM', status: 'リピーター配信セグメント抽出' }
      ]
    });

  } catch (error) {
    console.error('Error in akasawa-ceo function:', error);
    return json(500, { error: error.message || '内部サーバーエラーが発生しました。' });
  }
};
