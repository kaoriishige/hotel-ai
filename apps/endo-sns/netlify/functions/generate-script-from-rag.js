const https = require('https');
const fs = require('fs');
const path = require('path');
try {
  require('dotenv').config();
} catch (e) {}

// ローカル環境用 .env 自動ロード
if (!process.env.OPENAI_API_KEY && !process.env.OPEN_AI_API) {
  try {
    const envPath = path.resolve(__dirname, '../../../../.env');
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
    }
  } catch (e) {}
}

/**
 * フォールバック台本マップ
 */
function buildFallbackScript(theme) {
  const fallbackVariations = {
    '私を甘やかす、ご褒美時間': [
      {
        hook: '「その重荷、降ろしませんか？」',
        script: '私たちは皆、完璧であろうと頑張りすぎてしまいますね。森の木々がただそこに在るだけで美しいように、ありのままのあなたで尊いもの。言葉にならない静けさに身を委ね、素直な心で自分を慈しむ時間を持つこと。それが明日を生きる穏やかな力となると思うのです。'
      },
      {
        hook: '「自分を甘やかすのは、悪ではありません。」',
        script: '休むことに罪悪感を覚える必要はありません。道具を休ませるように、心にも休息が必要です。何も生産しない時間を自分に与え、素直な心を取り戻すこと。その静かなご褒美が、疲れ切った心に新しい潤いをもたらしてくれると思うのです。'
      },
      {
        hook: '「頑張りすぎた心に、ご褒美を。」',
        script: '毎日誰かのために走り続けてきたあなたへ。たまには立ち止まり、自分のためだけに静かなお茶を淹れてみる。他人の基準ではなく自分の歩幅を愛すること。素直な心で自分を慈しむ時間こそが、明日への大切な活力になると信じているのです。'
      }
    ],
    '「ちゃんとしなきゃ」を手放す言葉': [
      {
        hook: '「完璧な姿など、どこにもありません。」',
        script: '自然の森には真っ直ぐな木ばかりではありません。どれも曲がり、風に耐え、そのまま生きている。人も同じです。完璧を目指して肩を張らず、ありのままの自分を赦してあげる。それだけで、心に心地よい風が吹き抜けていくと思うのです。'
      },
      {
        hook: '「『完璧』の二文字をそっと置いてみる。」',
        script: 'ちゃんとしなきゃと自分を追い詰めると、素直な声を見失いがちです。不完全さの中にこそ、人間らしい温もりが宿るもの。肩の力を抜き、今の自分のままで歩んでみる。それだけで景色はガラリと優しく変わるのではないでしょうか。'
      },
      {
        hook: '「歪みがあるから、人は美しい。」',
        script: '風に揺れる木々に同じ形がないように、心も揺れて当たり前です。自分の弱さもそっと抱きしめてあげる。素直な心で自分と向き合うとき、肩肘張らずに生きる本当の強さと静けさが戻ってくると思うのです。'
      }
    ],
    '本当の豊かさと自分らしさ': [
      {
        hook: '「他人のスピードに惑わされなくていい。」',
        script: '周りと比べて焦る必要はありません。本当の豊かさとは、静かな場所で自分の心を慈しめること。他人の基準ではなく、あなた自身の歩幅で一日を重ねていく。自分のペースを愛せる素直な心こそが、最も贅沢な生き方ではないでしょうか。'
      },
      {
        hook: '「豊かな人生とは、心が穏やかであること。」',
        script: '多くのものを所有することだけが幸せではありません。木漏れ日や呼吸の深さに気づける素直な心を持つこと。世間の物差しを手放し、自分が心から心地よいと感じる時間を生きる。それこそが何より確かな豊かさだと思うのです。'
      },
      {
        hook: '「自分だけの歩幅を、愛すること。」',
        script: '他人の評価で自分を測ると心がすり減ってしまいます。大切なのは自分の声に耳を傾け、ありのままの歩みを尊重すること。静かな空間で自分と対話し今日を慈しむ。誰かと比べるのをやめたとき、確かな安心感が広がると思うのです。'
      }
    ],
    '静寂と森に包まれる、五感の癒やし': [
      {
        hook: '「静けさの中に、答えがあります。」',
        script: '風の音や木の葉の揺れに耳を澄ませてみる。雑音を横へ置き、五感の感じるままに身を委ねる。言葉を超えた自然の静寂に身を置くだけで、日常で擦り切れた心の調和がすーっと戻ってくる。素直な心で静けさと共にあることが何よりの癒やしです。'
      },
      {
        hook: '「森の静寂が、傷ついた心を包み込む。」',
        script: '忙しない喧騒から少し離れ、大自然の静寂に身を浸してみる。木々が放つ静かな気配は、言葉以上に心を優しく包み込んでくれます。頭で考えるのをやめ心が静かになる時間を自分に許すことで、本来の自分が甦ってくる気がするのです。'
      },
      {
        hook: '「耳を澄ますと、心が澄んでいく。」',
        script: '慌ただしい日常の中では自分の声すら聞こえなくなりますね。静かな環境でゆっくり呼吸を繰り返してみる。胸の底に溜まった疲労が解き放たれ心が澄み渡っていく。素直な心で静寂を味わう時間こそが明日へのエネルギーだと思うのです。'
      }
    ],
    '自分を取り戻す、マインドリセット': [
      {
        hook: '「心に、小さな余白を作りましょう。」',
        script: '誰かの期待に応えようと無理を重ねていませんか。一日のうちわずかでもいい、仮面を脱いで自分と向き合う時間を作る。素直な心で感情を受け止めてあげることで自分を取り戻せる。心にゆったりとした余白を持つことが大切だと思うのです。'
      },
      {
        hook: '「一度、立ち止まる勇気を持ってみる。」',
        script: '走り続けることだけが正解ではありません。行き詰まったときこそ立ち止まり、重荷を降ろしてみる。心に隙間が生まれたとき、新しい一歩を踏み出す穏やかなパワーが湧いてくる。素直な心で休むことは前進なのだと思うのです。'
      },
      {
        hook: '「本当の自分に、還る場所。」',
        script: '日常の立場や面目を脱ぎ捨て、素の自分に戻る時間を持つこと。静かな空間で心と体を休ませ、頑張ってきた自分を褒めてあげる。そうして心のリセットを行うことが、どんな時代も自分らしく生き抜くための大切な知恵だと思うのです。'
      }
    ]
  };

  const list = fallbackVariations[theme] || fallbackVariations['私を甘やかす、ご褒美時間'];
  const randomIndex = Math.floor(Math.random() * list.length);
  return list[randomIndex];
}

/**
 * OpenAI API 呼び出し関数
 */
function fetchOpenAIScript(apiKey, theme, isCustom) {
  return new Promise((resolve, reject) => {
    const systemPrompt = isCustom
      ? `あなたはTikTokやInstagramリールで視聴者の心を掴むプロのショート動画スクリプト制作者です。
ユーザーから与えられたテーマやメッセージ内容に完全に一致する、惹きつけるショート動画用台本（冒頭フック＋本文）を作成してください。

【制約事項】
1. 冒頭3秒フック（hook）: 視聴者のスクロールの手が止まる魅力的な一言（20文字以内）
2. 台本本文（script）: 動画尺約25秒〜30秒に収まるよう【130文字〜160文字程度】で、テーマの魅力を生き生きと伝える文章にしてください。
3. 出力フォーマット: 必ず以下のJSON形式のみを出力してください。
{"hook": "冒頭フック文", "script": "動画台本本文"}`
      : `あなたはTikTokやInstagramリールで数百万人の心に深く静かな感動を与える動画プロデューサーです。
遠藤正俊オーナーの人生哲学・思想（素直な心、何もしない余白、自然の静けさ）に基づき、心に響くショート動画台本を作成してください。

【制約事項】
1. 文字数: 動画尺30秒以内（約25秒〜28秒）に収まる【130文字〜150文字程度】。
2. 口調: 上品、深み、温かさ。「〜ですね」「〜だと思うのです」「〜ではないでしょうか」。
3. 冒頭3秒（hook）: 15文字以内の問いかけ。
4. 出力フォーマット: 必ず以下のJSON形式のみを出力してください。
{"hook": "冒頭フック文", "script": "動画台本本文"}`;

    const userPrompt = `【テーマ・メッセージ内容】\n${theme}\n\n上記にピッタリ一致するショート動画台本をJSON形式で作成してください。`;

    const postData = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7
    });

    const req = https.request('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 8000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
            const content = JSON.parse(parsed.choices[0].message.content);
            if (content.hook && content.script) {
              resolve(content);
              return;
            }
          }
          reject(new Error('Invalid OpenAI response: ' + body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('OpenAI API timeout'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Gemini API 呼び出し関数
 */
async function fetchGeminiScript(apiKey, theme, isCustom) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = isCustom
    ? `あなたはTikTokやInstagramリールで視聴者の心を掴むショート動画プロデューサーです。
以下のテーマ・メッセージ内容に完全に一致するショート動画台本を作成してください。

【テーマ】
${theme}

【要件】
1. 冒頭フック（hook）: 20文字以内
2. 台本本文（script）: 130文字〜160文字程度（25秒〜30秒尺）
3. JSON形式のみ出力: {"hook": "...", "script": "..."}`
    : `あなたはTikTokやInstagramリールで数百万人の心に深く静かな感動を与える動画プロデューサーです。
【文字数】130文字〜150文字程度（25秒〜28秒尺）
【語り手】遠藤正俊（素直な心、静けさ、余白を取り戻す語り）
【テーマ】${theme}
JSON形式のみ出力: {"hook": "...", "script": "..."}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { 
      responseMimeType: 'application/json',
      temperature: 0.7
    }
  });

  let responseText = result.response.text().trim();
  if (responseText.startsWith('```')) {
    responseText = responseText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
  }
  return JSON.parse(responseText.trim());
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const body = event.body ? JSON.parse(event.body || '{}') : {};
  const theme = body.theme || '私を甘やかす、ご褒美時間';
  
  // 固定5テーマ以外（または自由入力）かどうかを判定
  const fixedThemes = [
    '安定を捨てて生き方を変えた理由',
    '他人の価値観で生きるのをやめる',
    '世界中で大自然を見て気づいた人間社会のバグ',
    '価格競争・数字の競争から抜け出す思考',
    '余白と休息を意識的に作るマインドセット',
    '私を甘やかす、ご褒美時間',
    '「ちゃんとしなきゃ」を手放す言葉',
    '本当の豊かさと自分らしさ',
    '静寂と森に包まれる、五感の癒やし',
    '自分を取り戻す、マインドリセット'
  ];
  const isCustom = !fixedThemes.includes(theme);

  const openaiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API;
  const geminiKey = process.env.GEMINI_API_KEY;

  try {
    let scriptData = null;

    // 1. OpenAI API を最優先で使用
    if (openaiKey) {
      try {
        scriptData = await fetchOpenAIScript(openaiKey, theme, isCustom);
      } catch (openAiErr) {
        console.warn('OpenAI generation failed, trying Gemini or fallback:', openAiErr.message);
      }
    }

    // 2. OpenAI が失敗した場合、Gemini API を試行
    if (!scriptData && geminiKey) {
      try {
        scriptData = await fetchGeminiScript(geminiKey, theme, isCustom);
      } catch (geminiErr) {
        console.warn('Gemini generation failed:', geminiErr.message);
      }
    }

    // 3. AI生成結果がある場合のクリーンアップ
    if (scriptData && scriptData.hook && scriptData.script) {
      if (!isCustom) {
        // 固定思想テーマの場合のみ思想ルールに従った微調整を実施
        scriptData.script = scriptData.script
          .replace(/看板猫/g, '猫ちゃん')
          .replace(/露天風呂/g, '風呂')
          .replace(/ペットと泊まれる/g, '')
          .replace(/皆さん、こんにちは[。！]?/g, '')
          .replace(/赤沢温泉旅館?オーナーの遠藤正俊です[。！]?/g, '')
          .replace(/赤沢温泉/g, '')
          .replace(/赤沢/g, '')
          .replace(/旅館/g, '')
          .replace(/オーナー/g, '')
          .replace(/ぬる湯/g, '静けさ')
          .replace(/温泉/g, '自然')
          .replace(/お風呂/g, '静けさ')
          .replace(/湯船/g, '静寂')
          .trim();

        scriptData.hook = scriptData.hook
          .replace(/看板猫/g, '猫ちゃん')
          .replace(/露天風呂/g, '風呂')
          .replace(/ぬる湯/g, '静けさ')
          .replace(/温泉/g, '自然')
          .replace(/赤沢/g, '');
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(scriptData)
      };
    }

    // 4. いずれも利用できない場合はフォールバック
    const fallback = buildFallbackScript(theme);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(fallback)
    };

  } catch (error) {
    console.error('generate-script-from-rag Error:', error);
    const fallback = buildFallbackScript(theme);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(fallback)
    };
  }
};
