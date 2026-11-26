/**
 * 生成されたWAV音声をOpenAI Whisper API (verbose_json) で実測解析し、
 * 各テロップセグメントの正確な開始・終了時刻（秒）を算出するモジュール
 */

function normalizeForAlign(str) {
  return String(str || '')
    .replace(/[、。！？「」『』・\s\n\r,.\-!?()（）]/g, '')
    .trim();
}

/**
 * WAV Buffer を OpenAI Whisper API に送信し、発話セグメント／文字の実測タイムスタンプを取得
 */
async function transcribeWithTimestamps(audioBuffer, promptHint = '') {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API;
  if (!apiKey || !audioBuffer || audioBuffer.length === 0) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);

  try {
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/wav' });
    formData.append('file', blob, 'voice.wav');
    formData.append('model', 'whisper-1');
    formData.append('language', 'ja');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');
    formData.append('timestamp_granularities[]', 'word');
    if (promptHint) {
      formData.append('prompt', String(promptHint).slice(0, 200));
    }

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData,
      signal: controller.signal
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Whisper HTTP ${res.status}: ${errText.slice(0, 120)}`);
    }

    return await res.json();
  } catch (err) {
    console.warn('[whisper-aligner] Whisper解析失敗（フォールバック使用）:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whisper の実測セグメント／ワード時刻から、指定された各テロップセグメントの [start, end] を算出する
 * @param {Buffer} audioBuffer
 * @param {string[]} subtitleSegments 画面に表示する元テロップ配列
 * @param {string[]} segmentReadings 各テロップのひらがな読み配列
 */
async function alignSubtitlesWithWhisper(audioBuffer, subtitleSegments, segmentReadings) {
  if (!Array.isArray(subtitleSegments) || subtitleSegments.length === 0) return null;

  const hint = subtitleSegments.join('');
  const whisper = await transcribeWithTimestamps(audioBuffer, hint);
  if (!whisper) return null;

  // word タイムスタンプがあれば最優先、なければ segment タイムスタンプを使用
  const units = [];
  if (Array.isArray(whisper.words) && whisper.words.length > 0) {
    for (const w of whisper.words) {
      const t = normalizeForAlign(w.word);
      if (t.length > 0 && typeof w.start === 'number' && typeof w.end === 'number') {
        units.push({ text: t, start: w.start, end: Math.max(w.start, w.end) });
      }
    }
  }
  if (units.length === 0 && Array.isArray(whisper.segments) && whisper.segments.length > 0) {
    for (const s of whisper.segments) {
      const t = normalizeForAlign(s.text);
      if (t.length > 0 && typeof s.start === 'number' && typeof s.end === 'number') {
        units.push({ text: t, start: s.start, end: Math.max(s.start, s.end) });
      }
    }
  }

  if (units.length === 0) return null;

  // Whisper の各ユニット内の文字に実測時刻を線形展開した文字タイムラインを構築
  const charTimes = [];
  for (const u of units) {
    const chars = [...u.text];
    const dur = Math.max(0.02, u.end - u.start);
    chars.forEach((_, idx) => {
      const frac0 = idx / chars.length;
      const frac1 = (idx + 1) / chars.length;
      charTimes.push({
        start: u.start + dur * frac0,
        end: u.start + dur * frac1
      });
    });
  }

  const totalWhisperChars = charTimes.length;
  if (totalWhisperChars === 0) return null;

  // 各テロップセグメントの重み（ひらがな読みのモーラ数優先、なければ元テキスト長）
  const weights = subtitleSegments.map((seg, i) => {
    const r = (Array.isArray(segmentReadings) && segmentReadings[i]) ? segmentReadings[i] : seg;
    const norm = normalizeForAlign(r).replace(/[ゃゅょぁぃぅぇぉャュョァィゥェォ]/g, '');
    return Math.max(2, [...norm].length);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const firstStart = Math.max(0, charTimes[0].start);
  const lastEnd = charTimes[totalWhisperChars - 1].end;

  const timings = [];
  let acc = 0;
  for (let i = 0; i < subtitleSegments.length; i++) {
    const startFrac = acc / totalWeight;
    acc += weights[i];
    const endFrac = acc / totalWeight;

    const startIdx = Math.min(totalWhisperChars - 1, Math.max(0, Math.floor(startFrac * totalWhisperChars)));
    const endIdx = Math.min(totalWhisperChars - 1, Math.max(startIdx, Math.ceil(endFrac * totalWhisperChars) - 1));

    const segStart = i === 0 ? Math.min(0.05, firstStart) : charTimes[startIdx].start;
    const segEnd = i === subtitleSegments.length - 1 ? lastEnd + 0.4 : charTimes[endIdx].end;

    timings.push({
      start: Number(segStart.toFixed(3)),
      end: Number(Math.max(segStart + 0.35, segEnd).toFixed(3))
    });
  }

  // 境界の連続性を保証（前の終了＝次の開始）
  for (let i = 0; i < timings.length - 1; i++) {
    const mid = Number(((timings[i].end + timings[i + 1].start) / 2).toFixed(3));
    const safeMid = Math.max(timings[i].start + 0.3, Math.min(timings[i + 1].end - 0.3, mid));
    timings[i].end = safeMid;
    timings[i + 1].start = safeMid;
  }

  return {
    timings,
    duration: typeof whisper.duration === 'number' ? whisper.duration : lastEnd,
    alignedBy: Array.isArray(whisper.words) && whisper.words.length > 0 ? 'whisper-word' : 'whisper-segment'
  };
}

module.exports = { alignSubtitlesWithWhisper };
