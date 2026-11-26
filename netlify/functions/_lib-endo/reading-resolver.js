/**
 * 日本語テキストの難読漢字・地名・固有名詞・文脈依存漢字を裏側で徹底調査し、
 * 日本人ナレーターのような自然なイントネーション（適切な文節の読点「、」配置）を備えた
 * 漢字残存ゼロの完全「ひらがな」読み上げテキストへ変換するモジュール
 */

// 難読地名・固有名詞・よく誤読される語の確実な優先辞書（長い語から優先適用）
const READING_DICTIONARY = [
  ['奥日本シルバールート', 'おくにほん、しるばーるーと'],
  ['前沢曲家集落', 'まえざわ、まがりやしゅうらく'],
  ['大地の芸術祭', 'だいちの、げいじゅつさい'],
  ['湯之谷温泉郷', 'ゆのたに、おんせんきょう'],
  ['乳頭温泉郷', 'にゅうとう、おんせんきょう'],
  ['尾瀬国立公園', 'おぜ、こくりつこうえん'],
  ['白谷雲水峡', 'しらたに、うんすいきょう'],
  ['雪国観光圏', 'ゆきぐに、かんこうけん'],
  ['会津駒ヶ岳', 'あいづ、こまがたけ'],
  ['JR只見線', 'じぇいあーる、ただみせん'],
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
  ['遠藤正俊', 'えんどう、まさとし'],
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

const READING_INVESTIGATION_PROMPT = `あなたはNHKのベテラン日本語アナウンサー兼、音声合成（TTS）の韻律・イントネーション調整の専門家です。
入力された日本語のテロップ配列（segments）を、音声合成エンジンが「日本人らしい自然なイントネーション・抑揚・息継ぎ」で読み上げられるよう、
1つ1つのセグメントごとに漢字の読み方を厳密に調査し、漢字残存ゼロの「ひらがな＋自然な句読点」に変換してください。

【日本人らしいイントネーションにするための絶対ルール】
1. 漢字は1文字たりとも残さず、文脈に合った正確な「ひらがな」にすること（難読地名・人名・同形異音語「行く＝いく/ゆく」「方＝ほう/かた」「一日＝いちにち/ついたち」「手放す＝てばなす」「身体＝からだ」等を正確に判断）。
2. ★最重要（句読点の入れ方でイントネーションを整える）：
   - ひらがなが長く繋がるとTTSは単語の切れ目を見失って棒読み・変なイントネーションになる。
   - 日本人が自然に語りかけるリズムになるよう、**8〜15文字程度の意味のまとまり（文節・主語「〜は」「〜が」の後・情景の区切り・強調したい語の前・接続詞の後）に、読点「、」を丁寧に補うこと**。
   - ただし、単語の途中や助詞の直前で不自然に切らないこと（例：○「ひのえまたむらの、せいじゃくのなかで、」 ×「ひのえ、またむらの」）。
   - 文の終わりは必ず「。」（または「！」「？」）でしっかり息継ぎの間を作ること。
3. 数字・単位・英字も自然な日本語のひらがな読みにすること（例：50代→ごじゅうだい、3000年→さんぜんねん、pH2.1→ぴーえいち、にてんいち、SNS→えすえぬえす）。
4. 外来語のカタカナ語（例：リセット、シルバー、ルート）はひらがなでもカタカナでも構わないが、日本語として自然に読める形にすること。
5. 元の文章の意味・語順・語尾は一切変えないこと。
6. 入力された segments の個数と順番を厳守し、1対1で対応する segmentReadings 配列を返すこと。

必ず以下のJSON形式のみで返答してください：
{
  "checkedReadings": [
    { "word": "元の漢字語", "reading": "調査した正しいひらがな読み" }
  ],
  "segmentReadings": [
    "1番目のセグメントの完全ひらがな（自然な読点入り）",
    "2番目のセグメントの完全ひらがな（自然な読点入り）"
  ]
}`;

const STRICT_CLEANUP_PROMPT = `以下の日本語テキストに残っている漢字・数字・英字を、1文字も残さずすべて文脈に合った正確な「ひらがな」に変換してください。
句読点（、。！？）と元のひらがな・カタカナはそのまま残し、ひらがなが15文字以上繋がる場合は自然な文節の切れ目に「、」を入れてください。
変換後のテキストのみを出力してください（説明・記号・マークダウン禁止）。`;

function stripHashtags(text) {
  return String(text || '')
    .replace(/[#＃][^\s#＃、。！？\n]+/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function applyReadingDictionary(text) {
  let result = String(text || '');
  for (const [kanji, reading] of READING_DICTIONARY) {
    if (result.includes(kanji)) {
      result = result.split(kanji).join(reading);
    }
  }
  return result.replace(/、、+/g, '、').replace(/^、+/, '').trim();
}

function countKanji(text) {
  const matches = String(text || '').match(KANJI_REGEX);
  return matches ? matches.length : 0;
}

function normalizeSpokenPunctuation(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/、、+/g, '、')
    .replace(/、([。！？])/g, '$1')
    .replace(/^、+/, '')
    .trim();
}

async function callOpenAIJson(apiKey, model, systemPrompt, userText, timeoutMs = 14000) {
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
        max_tokens: 2200,
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
        max_tokens: 1600,
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

async function callGeminiJson(apiKey, userText, timeoutMs = 14000) {
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
            parts: [{ text: `${READING_INVESTIGATION_PROMPT}\n\n【入力データ】\n${userText}` }]
          }
        ],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 2400,
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

function joinSegmentReadings(segmentReadings) {
  return segmentReadings
    .map(s => normalizeSpokenPunctuation(s))
    .filter(Boolean)
    .map((s, idx, arr) => {
      if (idx < arr.length - 1 && !/[。！？、]$/.test(s)) {
        return s + '、';
      }
      return s;
    })
    .join('');
}

/**
 * 入力テキスト（および任意のテロップセグメント配列）の漢字読み方を裏側で徹底調査し、
 * 日本人らしい句読点付きの完全ひらがなテキスト＋セグメント別読み配列を返す
 * @param {string} rawText
 * @param {string[]} [subtitleSegments]
 */
async function resolveJapaneseReading(rawText, subtitleSegments = null) {
  const cleanedFull = stripHashtags(rawText);
  const inputSegments = Array.isArray(subtitleSegments) && subtitleSegments.length > 0
    ? subtitleSegments.map(s => stripHashtags(s)).filter(Boolean)
    : (cleanedFull ? [cleanedFull] : []);

  if (inputSegments.length === 0) {
    return {
      spokenText: String(rawText || '').trim(),
      segmentReadings: [],
      resolvedBy: 'raw',
      checkedReadings: [],
      remainingKanjiCount: 0
    };
  }

  // 1. まず各セグメントに固有名詞・難読地名辞書を適用
  const dictSegments = inputSegments.map(seg => applyReadingDictionary(seg));
  const openaiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API;
  const geminiKey = process.env.GEMINI_API_KEY;

  let resolvedSegments = null;
  let checkedReadings = [];
  let resolvedBy = 'dict';

  const userPayload = JSON.stringify({ segments: dictSegments }, null, 2);

  // 2. OpenAI gpt-4o（最高精度）で読み方調査＋日本人らしい句読点付きひらがな変換
  if (openaiKey) {
    for (const model of ['gpt-4o', 'gpt-4o-mini']) {
      try {
        const parsed = await callOpenAIJson(openaiKey, model, READING_INVESTIGATION_PROMPT, userPayload);
        if (parsed && Array.isArray(parsed.segmentReadings) && parsed.segmentReadings.length === dictSegments.length) {
          resolvedSegments = parsed.segmentReadings.map(s => normalizeSpokenPunctuation(applyReadingDictionary(s)));
          checkedReadings = Array.isArray(parsed.checkedReadings) ? parsed.checkedReadings : [];
          resolvedBy = `${model}+prosody`;
          break;
        }
      } catch (err) {
        console.warn(`[reading-resolver] ${model} 調査変換失敗:`, err.message);
      }
    }
  }

  // 3. OpenAI 失敗時は Gemini で試行
  if (!resolvedSegments && geminiKey) {
    try {
      const parsed = await callGeminiJson(geminiKey, userPayload);
      if (parsed && Array.isArray(parsed.segmentReadings) && parsed.segmentReadings.length === dictSegments.length) {
        resolvedSegments = parsed.segmentReadings.map(s => normalizeSpokenPunctuation(applyReadingDictionary(s)));
        checkedReadings = Array.isArray(parsed.checkedReadings) ? parsed.checkedReadings : [];
        resolvedBy = 'gemini-2.5-flash+prosody';
      }
    } catch (err) {
      console.warn('[reading-resolver] Gemini 調査変換失敗:', err.message);
    }
  }

  let finalSegments = resolvedSegments || dictSegments;

  // 4. 漢字が1文字でも残っているセグメントがあれば強制クリーンアップパスで漢字ゼロ保証
  if (openaiKey) {
    let didStrictPass = false;
    for (let i = 0; i < finalSegments.length; i++) {
      if (countKanji(finalSegments[i]) > 0) {
        try {
          const cleanedSeg = await callOpenAIText(openaiKey, 'gpt-4o', STRICT_CLEANUP_PROMPT, finalSegments[i]);
          if (cleanedSeg && countKanji(cleanedSeg) < countKanji(finalSegments[i])) {
            finalSegments[i] = normalizeSpokenPunctuation(applyReadingDictionary(cleanedSeg));
            didStrictPass = true;
          }
        } catch (err) {
          console.warn(`[reading-resolver] セグメント${i}の漢字クリーンアップ失敗:`, err.message);
        }
      }
    }
    if (didStrictPass) resolvedBy += '+strict';
  }

  const finalSpoken = joinSegmentReadings(finalSegments);

  return {
    spokenText: finalSpoken,
    segmentReadings: finalSegments,
    resolvedBy,
    checkedReadings,
    remainingKanjiCount: countKanji(finalSpoken)
  };
}

module.exports = { resolveJapaneseReading, applyReadingDictionary, stripHashtags, countKanji };
