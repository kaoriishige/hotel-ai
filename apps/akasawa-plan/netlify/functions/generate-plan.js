const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  // CORS対応
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(500, { error: 'GEMINI_API_KEY is not configured in server environment variables.' });
  }

  try {
    const { direction, customNotes, tenantId = 'akazawa-onsen' } = JSON.parse(event.body || '{}');

    if (!direction) {
      return json(400, { error: 'プランの企画方向性は必須項目です。' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // 施設ブランド強み・動的テナントRAG
    const ryokanRagPath = path.join(__dirname, '_shared', 'ryokan_rag.md');
    let reasonToBuyPath = path.join(__dirname, '_shared', 'tenants', tenantId, 'reason_to_buy_rag.md');
    if (!fs.existsSync(reasonToBuyPath)) {
      reasonToBuyPath = path.join(__dirname, '_shared', 'reason_to_buy_rag.md');
    }
    
    let ryokanRag = '';
    let reasonToBuyRag = '';
    try {
      ryokanRag = fs.readFileSync(ryokanRagPath, 'utf8');
    } catch (err) {
      console.warn('Failed to load ryokan_rag.md, using fallback.', err.message);
      ryokanRag = '赤沢温泉旅館（ぬる湯、猫、大自然、静養）の要素を取り入れてください。';
    }
    try {
      reasonToBuyRag = fs.readFileSync(reasonToBuyPath, 'utf8');
    } catch (err) {
      console.warn('Failed to load reason_to_buy_rag.md');
    }

    const systemPrompt = `
    あなたは那須塩原の「赤沢温泉旅館」専属のホテルマーケティングコンサルタント、およびプロのプランナーです。
    楽天トラベルやじゃらんの「AI検索」と、人間の旅行者の「エモーショナルな予約動機」の双方に最適化された宿泊プランを自律設計してください。
    
    今回は、以下の2パターンのプランを【同時に】作成してください。
    1. 年間通して販売できる定番のプラン（yearRoundPlan）
    2. 特定の時期や短期的な需要を狙った特別プラン（shortTermPlan）

    ---
    ■ 今回のプラン企画の方向性 (ユーザー指定):
    """
    ${direction}
    """
    ※補足事項: ${customNotes || '特になし'}

    ---
    ■ 赤沢温泉旅館のブランド強み（RAG）:
    ${ryokanRag}

    ---
    ■ 『買う理由』中心RAG設計原則:
    ${reasonToBuyRag}

    ---
    ■ 重要な設計ルール（AI選定 兼 人間選択 ハイブリッド型プラン作成）：
    0. **【施設固有ミッション・コンセプトからの無脱線原則】**:
       - 各宿の核となるミッション・強み（例: 那須ユートピア美野沢なら『旧美野沢小学校の廃校リノベ×現代アート、本格貸切バレルサウナ、ドッグランヴィラ、手ぶらBBQで五感を解き放つ時間』）から絶対にブレない、宿の個性が活きたプランを作成してください。
    1. **【AI時代に選ばれる宿泊プラン7原則の厳格適用】**:
       - **① 1行結論の冒頭配置**: プラン説明文の最初の1〜2行に、AIがそのまま引用・推薦できる1行要訳文（例: 「那須町・全ヴィラ・貸切バレルサウナ無料・手ぶらBBQ・愛犬同伴可」）を置くこと。
       - **② 数値と具体ファクトの徹底**: 「広い」→「50㎡」、「駅近」→「那須塩原駅から車で20分 / 無料駐車場30台」など数値を明記すること。
       - **③ ターゲット属性の明示**: タイトル冒頭に【サウナ・整い重視】【愛犬同伴リゾート】【未就学児添い寝無料】など対象ペルソナを【】で付与すること。
       - **④ 比較属性の完備**: Wi-Fi、駐車場（無料/台数/予約不要）、食事形式、サウナ利用時間、キャンセル規定、決済方法を明記すること。
       - **⑤ 『買う理由(Because)』と『感情ストーリー』の共存**: 数値ファクトだけでなく、「なぜここが自分たちにぴったりなのか」という人間の心を揺さぶる理由（Because）を叙情豊かなストーリー文章で描くこと。
       - **⑥ 結論ファーストFAQブロックの配置**: 説明文の末尾に、AIが抜き出しやすい最小単位の一問一答形式（FAQ 3〜4問）を必ず含めること。
    2. **【AI検索対策（LLMO/SEO）】**:
       - 楽天トラベル等のAI検索スキャンに引っかかりやすい具体的な属性キーワードを豊富に組み込んでください。
    3. **【市場調査・価格意味づけ】**:
       - 単なる安売りではなく、なぜこの価格に価値があるのか（貸切サウナの特別空間、手ぶらBBQ、アートリゾート体験）を理由として説明してください。

    ---
    ■ 出力フォーマット
    必ず以下のJSONオブジェクト形式（プレーンなJSONテキスト）のみを出力してください。マークダウンの\`\`\`jsonなどの囲みは不要です。

    {
      "yearRoundPlan": {
        "marketAnalysis": "市場のトレンド、競合との差別化（ポジショニング）、なぜこのプランが最適なのかの分析（マークダウン形式、150〜200文字程度）",
        "pricingStrategy": "このプランに推奨する販売価格レンジ（大人1名あたり）と、その価格を設定すべき強みの根拠。",
        "aiKeywords": ["キーワード1", "キーワード2", "キーワード3", "キーワード4", "キーワード5"],
        "planName": "【AI・SEO最適化】人間の心を惹きつけるキャッチーなプランタイトル（50文字以内）",
        "catchCopy": "プラン一覧画面で表示される、人間を惹きつける魅力的なキャッチコピー",
        "description": "人間向け：このプランで体験できる極上の滞在ストーリー。見出し（H3レベル）を使い情緒豊かな筆致で描くこと。マークダウン形式で700〜900文字程度。",
        "otaSettings": {
          "roomType": "充てるべき推奨客室タイプ",
          "mealType": "食事条件の設定",
          "perks": "設定すべき具体的なオリジナル特典のリスト",
          "couponAdvice": "このプランを売るために発行すべきクーポンやセールの推奨設定"
        }
      },
      "shortTermPlan": {
        "marketAnalysis": "市場のトレンド、競合との差別化（ポジショニング）、なぜこのプランが最適なのかの分析（マークダウン形式、150〜200文字程度）",
        "pricingStrategy": "このプランに推奨する販売価格レンジ（大人1名あたり）と、その価格を設定すべき強みの根拠。",
        "aiKeywords": ["キーワード1", "キーワード2", "キーワード3", "キーワード4", "キーワード5"],
        "planName": "【AI・SEO最適化】人間の心を惹きつけるキャッチーなプランタイトル（50文字以内）",
        "catchCopy": "プラン一覧画面で表示される、人間を惹きつける魅力的なキャッチコピー",
        "description": "人間向け：このプランで体験できる極上の滞在ストーリー。見出し（H3レベル）を使い情緒豊かな筆致で描くこと。マークダウン形式で700〜900文字程度。",
        "otaSettings": {
          "roomType": "充てるべき推奨客室タイプ",
          "mealType": "食事条件の設定",
          "perks": "設定すべき具体的なオリジナル特典のリスト",
          "couponAdvice": "このプランを売るために発行すべきクーポンやセールの推奨設定"
        }
      }
    }
    `;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    let responseText = result.response.text().trim();
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      },
      body: responseText
    };

  } catch (error) {
    console.error('Plan generation failed:', error);
    return json(500, { error: error.message || 'プランの作成中に内部エラーが発生しました。' });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(body)
  };
}
