/**
 * 日本語テキストの難読漢字・地名・固有名詞・文脈依存漢字を裏側で調査し、
 * 音声合成エンジン(Cartesia TTS等)が読み間違えない正確な「かな読み上げテキスト」に変換するモジュール
 */

// 難読地名・固有名詞・よく誤読される語の確実な優先辞書（長い語から優先適用）
const READING_DICTIONARY = [
  ['奥日本シルバールート', 'おくにほんしるばーるーと'],
  ['前沢曲家集落', 'まえざわまがりやしゅうらく'],
  ['大地の芸術祭', 'だいちのげいじゅつさい'],
  ['湯之谷温泉郷', 'ゆのたにおんせんきょう'],
  ['乳頭温泉郷', 'にゅうとうおんせんきょう'],
  ['尾瀬国立公園', 'おぜこくりつこうえん'],
  ['白谷雲水峡', 'しらたにうんすいきょう'],
  ['雪国観光圏', 'ゆきぐにかんこうけん'],
  ['会津駒ヶ岳', 'あいづこまがたけ'],
  ['JR只見線', 'じぇいあーるただみせん'],
  ['檜枝岐村', 'ひのえまたむら'],
  ['南会津町', 'みなみあいづまち'],
  ['那須塩原', 'なすしおばら'],
  ['塩原温泉', 'しおばらおんせん'],
  ['大湯温泉', 'おおゆおんせん'],
  ['道後温泉', 'どうごおんせん'],
  ['長湯温泉', 'ながゆおんせん'],
  ['万座温泉', 'まんざおんせん'],
  ['草津温泉', 'くさつおんせん'],
  ['酸ヶ湯温泉', 'すかゆおんせん'],
  ['十津川温泉', 'とつかわおんせん'],
  ['黒川温泉', 'くろかわおんせん'],
  ['有馬温泉', 'ありまおんせん'],
  ['別府温泉', 'べっぷおんせん'],
  ['登別温泉', 'のぼりべつおんせん'],
  ['足尾銅山', 'あしおどうざん'],
  ['渡良瀬川', 'わたらせがわ'],
  ['越後妻有', 'えちごつまり'],
  ['紀伊山地', 'きいさんち'],
  ['遠藤正俊', 'えんどうまさとし'],
  ['からむし織', 'からむしおり'],
  ['奥只見湖', 'おくただみこ'],
  ['檜枝岐', 'ひのえまた'],
  ['奥只見', 'おくただみ'],
  ['湯之谷', 'ゆのたに'],
  ['沼沢湖', 'ぬまざわこ'],
  ['金山町', 'かねやままち'],
  ['昭和村', 'しょうわむら'],
  ['魚沼市', 'うおぬまし'],
  ['只見線', 'ただみせん'],
  ['酸ヶ湯', 'すかゆ'],
  ['十津川', 'とつかわ'],
  ['八甲田', 'はっこうだ'],
  ['屋久島', 'やくしま'],
  ['一軒宿', 'いっけんやど'],
  ['原生林', 'げんせいりん'],
  ['茅葺き', 'かやぶき'],
  ['箒川', 'ほうきがわ'],
  ['塩原', 'しおばら'],
  ['魚沼', 'うおぬま'],
  ['曲家', 'まがりや'],
  ['尾瀬', 'おぜ'],
  ['足尾', 'あしお'],
  ['鉄輪', 'かんなわ'],
  ['明礬', 'みょうばん'],
  ['登別', 'のぼりべつ'],
  ['遠藤', 'えんどう'],
  ['湯治', 'とうじ'],
  ['白濁', 'はくだく'],
  ['湧出', 'ゆうしゅつ'],
  ['矜持', 'きょうじ'],
  ['驕り', 'おごり'],
  ['智慧', 'ちえ'],
  ['悠久', 'ゆうきゅう'],
  ['佇む', 'たたずむ'],
  ['静寂', 'せいじゃく'],
  ['喧騒', 'けんそう'],
  ['余白', 'よはく'],
  ['俯瞰', 'ふかん'],
  ['疲弊', 'ひへい']
];

const READING_SYSTEM_PROMPT = `あなたは日本の放送局のベテランアナウンサー兼、日本語アクセント・読み方監修者です。
入力された日本語のナレーション台本を、音声合成エンジン（TTS）が絶対に漢字を読み間違えないようにするため、文脈と固有名詞（地名・人名・歴史用語・自然用語・数字の読み方）を正確に調査・判断したうえで、読み上げ専用の「ひらがな中心テキスト」に変換してください。

【厳守ルール】
1. すべての漢字（難読地名、人名、熟語、送り仮名を含む訓読み、同形異音語「行く＝いく/ゆく」「方＝ほう/かた」「一日＝いちにち/ついたち」「日本＝にほん/にっぽん」「風＝かぜ/ふう」「何＝なに/なん」など）を、文脈に合った正確な「ひらがな」に変換すること。
2. 数字・単位・アルファベットも自然な日本語の読みに変換すること（例：50代→ごじゅうだい、3000年→さんぜんねん、pH2.1→ぴーえいちにてんいち、SNS→えすえぬえす、100%→ひゃくぱーせんと）。
3. 外来語のカタカナ語（例：リセット、マインドセット、シルバー、ルートなど）はカタカナまたはひらがなで自然な読みに保つこと。
4. 句読点（、。！？）や「」は、音声の自然な間（ポーズ）と抑揚を保つため、元の位置にそのまま残すこと。
5. 元の文章の意味・語順・文末表現を勝手に変えたり、要約・追記したりしないこと。
6. 出力は変換後の読み上げ用テキストのみを返すこと。解説・前置き・引用符・マークダウンは一切出力しないこと。`;

function stripHashtags(text) {
  return String(text || '')
    .replace(/[#＃][^\s#＃、。！？\n]+/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function applyReadingDictionary(text) {
  let result = text;
  for (const [kanji, reading] of READING_DICTIONARY) {
    if (result.includes(kanji)) {
      result = result.split(kanji).join(reading);
    }
  }
  return result;
}

async function resolveWithOpenAI(apiKey, text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: READING_SYSTEM_PROMPT },
          { role: 'user', content: text }
        ]
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`OpenAI HTTP ${res.status}`);
    }
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    if (!out) throw new Error('OpenAI empty output');
    return out;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveWithGemini(apiKey, text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${READING_SYSTEM_PROMPT}\n\n【変換対象テキスト】\n${text}` }]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1200
        }
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}`);
    }
    const data = await res.json();
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!out) throw new Error('Gemini empty output');
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 入力テキストの漢字読み方を裏側で調査・かな変換して返す
 * @param {string} rawText
 * @returns {Promise<{ spokenText: string, resolvedBy: string }>}
 */
async function resolveJapaneseReading(rawText) {
  const cleaned = stripHashtags(rawText);
  if (!cleaned) {
    return { spokenText: String(rawText || '').trim(), resolvedBy: 'raw' };
  }

  // まず固有名詞・難読地名辞書を確実に適用
  const dictApplied = applyReadingDictionary(cleaned);

  const openaiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (openaiKey) {
    try {
      const converted = await resolveWithOpenAI(openaiKey, dictApplied);
      if (converted && converted.length >= Math.floor(cleaned.length * 0.5)) {
        return { spokenText: applyReadingDictionary(converted), resolvedBy: 'openai+dict' };
      }
    } catch (err) {
      console.warn('[reading-resolver] OpenAI読み方変換失敗、フォールバックします:', err.message);
    }
  }

  if (geminiKey) {
    try {
      const converted = await resolveWithGemini(geminiKey, dictApplied);
      if (converted && converted.length >= Math.floor(cleaned.length * 0.5)) {
        return { spokenText: applyReadingDictionary(converted), resolvedBy: 'gemini+dict' };
      }
    } catch (err) {
      console.warn('[reading-resolver] Gemini読み方変換失敗、辞書結果にフォールバックします:', err.message);
    }
  }

  return { spokenText: dictApplied, resolvedBy: 'dict' };
}

module.exports = { resolveJapaneseReading, applyReadingDictionary, stripHashtags };
