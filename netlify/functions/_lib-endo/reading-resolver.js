/**
 * 日本語テキストの難読漢字・地名・固有名詞・文脈依存漢字を裏側で徹底調査し、
 * 漢字残存ゼロの完全「ひらがな」読み上げテキストへ変換するモジュール
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

const KANJI_REGEX = /[\u4E00-\u9FFF々〆ヵヶ]/g;

const READING_INVESTIGATION_PROMPT = `あなたはNHK放送文化研究所レベルの日本語アクセント・読み方専門の監修者です。
入力された日本語テキストを、音声合成（TTS）が1文字も読み間違えないようにするため、
まず文中のすべての漢字語・地名・人名・歴史用語・自然用語・同形異音語・数字表現の正しい読み方を文脈から厳密に調査し、
次にテキスト全文を「漢字ゼロの完全なひらがな（外来語のみカタカナまたはひらがな）」へ変換してください。

【絶対厳守ルール】
1. hiraganaText には漢字（例：山、川、人、日、一、々 等）を「1文字たりとも」残してはならない。すべてひらがなに変換すること。
2. 同形異音語は必ず文脈から正確な読みを選ぶこと：
   - 行く（いく / ゆく）、方（ほう / かた）、一日（いちにち / ついたち）、日本（にほん / にっぽん）、風（かぜ / ふう）、何（なに / なん）、人々（ひとびと）、日々（ひび）、様々（さまざま）、本来（ほんらい）、自然（しぜん）、人間（にんげん）、身体（からだ / しんたい）、大人（おとな）、今日（きょう）、明日（あした）、昨日（きのう）、今年（ことし）、一人（ひとり）、二人（ふたり）、一つ（ひとつ）等。
3. 地名・固有名詞・難読語は正確な現地読み・辞書読みを調査して適用すること。
4. 数字・単位・英字もすべて日本語の読み（ひらがな）にすること（例：50代→ごじゅうだい、3000年→さんぜんねん、100%→ひゃくぱーせんと、pH2.1→ぴーえいちにてんいち、SNS→えすえぬえす）。
5. 句読点（、。！？）と「」は自然な間と抑揚を保つため、元の位置にそのまま残すこと。
6. 元の文章の語順・意味・文末表現は一切変えないこと。

必ず以下のJSON形式のみで返答してください：
{
  "checkedReadings": [
    { "word": "元の漢字語", "reading": "調査した正しいひらがな読み" }
  ],
  "hiraganaText": "漢字を1文字も残さず完全ひらがな化した全文"
}`;

const STRICT_CLEANUP_PROMPT = `以下の日本語テキストに残っている漢字・数字・英字を、1文字も残さずすべて文脈に合った正確な「ひらがな」に変換してください。
句読点（、。！？）と「」と元のひらがな・カタカナはそのまま残してください。
変換後のテキストのみを出力してください（説明・記号・マークダウン禁止）。`;

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

function countKanji(text) {
  const matches = String(text || '').match(KANJI_REGEX);
  return matches ? matches.length : 0;
}

function katakanaToHiraganaIfNeeded(text) {
  // 外来語以外の不要な記号除去や空白整形のみ（カタカナは自然な発音のため維持）
  return String(text || '').replace(/\r\n/g, '\n').trim();
}

async function callOpenAIJson(apiKey, model, systemPrompt, userText, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.0,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText }
        ]
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`OpenAI(${model}) HTTP ${res.status}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error(`OpenAI(${model}) empty output`);
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAIText(apiKey, model, systemPrompt, userText, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.0,
        max_tokens: 1400,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText }
        ]
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`OpenAI(${model}) HTTP ${res.status}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error(`OpenAI(${model}) empty output`);
    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiJson(apiKey, userText, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${READING_INVESTIGATION_PROMPT}\n\n【変換対象テキスト】\n${userText}` }]
          }
        ],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json'
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
    return JSON.parse(out);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 入力テキストの漢字読み方を裏側で徹底調査・完全ひらがな変換して返す
 * @param {string} rawText
 * @returns {Promise<{ spokenText: string, resolvedBy: string, checkedReadings: Array<{word:string, reading:string}>, remainingKanjiCount: number }>}
 */
async function resolveJapaneseReading(rawText) {
  const cleaned = stripHashtags(rawText);
  if (!cleaned) {
    return { spokenText: String(rawText || '').trim(), resolvedBy: 'raw', checkedReadings: [], remainingKanjiCount: 0 };
  }

  // 1. まず固有名詞・難読地名辞書を適用
  const dictApplied = applyReadingDictionary(cleaned);
  if (countKanji(dictApplied) === 0) {
    return { spokenText: dictApplied, resolvedBy: 'dict', checkedReadings: [], remainingKanjiCount: 0 };
  }

  const openaiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API;
  const geminiKey = process.env.GEMINI_API_KEY;

  let hiraganaText = null;
  let checkedReadings = [];
  let resolvedBy = 'dict';

  // 2. OpenAI gpt-4o（最高精度）で読み方調査＋ひらがな変換
  if (openaiKey) {
    for (const model of ['gpt-4o', 'gpt-4o-mini']) {
      try {
        const parsed = await callOpenAIJson(openaiKey, model, READING_INVESTIGATION_PROMPT, dictApplied);
        if (parsed && typeof parsed.hiraganaText === 'string' && parsed.hiraganaText.trim().length >= Math.floor(cleaned.length * 0.5)) {
          hiraganaText = katakanaToHiraganaIfNeeded(applyReadingDictionary(parsed.hiraganaText));
          checkedReadings = Array.isArray(parsed.checkedReadings) ? parsed.checkedReadings : [];
          resolvedBy = `${model}+dict`;
          break;
        }
      } catch (err) {
        console.warn(`[reading-resolver] ${model} 調査変換失敗:`, err.message);
      }
    }
  }

  // 3. OpenAI が失敗した場合は Gemini で試行
  if (!hiraganaText && geminiKey) {
    try {
      const parsed = await callGeminiJson(geminiKey, dictApplied);
      if (parsed && typeof parsed.hiraganaText === 'string' && parsed.hiraganaText.trim().length >= Math.floor(cleaned.length * 0.5)) {
        hiraganaText = katakanaToHiraganaIfNeeded(applyReadingDictionary(parsed.hiraganaText));
        checkedReadings = Array.isArray(parsed.checkedReadings) ? parsed.checkedReadings : [];
        resolvedBy = 'gemini-2.5-flash+dict';
      }
    } catch (err) {
      console.warn('[reading-resolver] Gemini 調査変換失敗:', err.message);
    }
  }

  let finalSpoken = hiraganaText || dictApplied;

  // 4. 漢字が1文字でも残っていれば強制クリーンアップパスを実行して漢字ゼロを保証
  if (countKanji(finalSpoken) > 0 && openaiKey) {
    try {
      const cleanedAgain = await callOpenAIText(openaiKey, 'gpt-4o', STRICT_CLEANUP_PROMPT, finalSpoken);
      if (cleanedAgain && countKanji(cleanedAgain) < countKanji(finalSpoken)) {
        finalSpoken = katakanaToHiraganaIfNeeded(applyReadingDictionary(cleanedAgain));
        resolvedBy += '+strict-pass';
      }
    } catch (err) {
      console.warn('[reading-resolver] 漢字残存クリーンアップ失敗:', err.message);
    }
  }

  return {
    spokenText: finalSpoken,
    resolvedBy,
    checkedReadings,
    remainingKanjiCount: countKanji(finalSpoken)
  };
}

module.exports = { resolveJapaneseReading, applyReadingDictionary, stripHashtags, countKanji };
