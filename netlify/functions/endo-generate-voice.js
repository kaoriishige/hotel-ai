const { generateVoiceFromText } = require('./_lib-endo/gemini-tts');
const { generateVoiceFromCartesia } = require('./_lib-endo/cartesia-tts');
const { resolveJapaneseReading } = require('./_lib-endo/reading-resolver');
const { alignSubtitlesWithWhisper } = require('./_lib-endo/whisper-aligner');
const { getDb } = require('./_lib-endo/firebase-admin');
const { ok, badRequest, methodNotAllowed, parseBody, json } = require('./_lib-endo/helpers');
const { z } = require('zod');

const schema = z.object({
  text: z.string().min(1, 'Text is required'),
  subtitleSegments: z.array(z.string()).optional(),
  spokenTextOverride: z.string().optional(),
  submissionId: z.string().optional(),
  voiceName: z.string().optional().default('Charon')
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({ ok: true });
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  try {
    const payload = schema.parse(parseBody(event));
    const filename = `voice_${payload.submissionId || Date.now()}_${payload.voiceName}.wav`;

    // 裏側で漢字・難読地名・固有名詞の読み方を徹底調査し、日本人らしい句読点入りひらがなテキストへ変換
    let spokenText;
    let segmentReadings = [];
    let resolvedBy;
    let checkedReadings = [];
    let remainingKanjiCount = 0;

    if (payload.spokenTextOverride && payload.spokenTextOverride.trim()) {
      spokenText = payload.spokenTextOverride.trim();
      resolvedBy = 'manual_hiragana';
    } else {
      const resolved = await resolveJapaneseReading(payload.text, payload.subtitleSegments);
      spokenText = resolved.spokenText;
      segmentReadings = resolved.segmentReadings || [];
      resolvedBy = resolved.resolvedBy;
      checkedReadings = resolved.checkedReadings || [];
      remainingKanjiCount = resolved.remainingKanjiCount || 0;
    }
    console.log(`[generate-voice] reading resolved by ${resolvedBy} (remainingKanji=${remainingKanjiCount}, segs=${segmentReadings.length}): "${spokenText.substring(0, 50)}..."`);

    // Cartesia の設定が存在する場合は Cartesia API で遠藤正俊クローン音声を生成し、
    // そうでない場合は従来どおり Gemini API で生成する
    let audioUrl;
    let audioDataUrl = null;
    let audioBuffer = null;
    if (process.env.CARTESIA_API_KEY && process.env.CARTESIA_VOICE_ID) {
      const result = await generateVoiceFromCartesia(spokenText, filename, { returnDetails: true });
      audioUrl = result.audioUrl;
      audioDataUrl = result.audioDataUrl;
      audioBuffer = result.audioBuffer || null;
    } else {
      audioUrl = await generateVoiceFromText(spokenText, filename, payload.voiceName);
    }

    // Whisper API で実際の音声波形からテロップの実測タイムスタンプを算出
    let subtitleTimings = null;
    let timingAlignedBy = 'fallback';
    if (audioBuffer && Array.isArray(payload.subtitleSegments) && payload.subtitleSegments.length > 0) {
      const aligned = await alignSubtitlesWithWhisper(audioBuffer, payload.subtitleSegments, segmentReadings);
      if (aligned && Array.isArray(aligned.timings) && aligned.timings.length === payload.subtitleSegments.length) {
        subtitleTimings = aligned.timings;
        timingAlignedBy = aligned.alignedBy;
      }
    }

    // submissionIdがある場合はFirestoreの該当ドキュメントを更新
    if (payload.submissionId) {
      const db = getDb();
      const docRef = db.collection('submissions').doc(payload.submissionId);
      const doc = await docRef.get();
      if (doc.exists) {
        await docRef.update({
          voiceUrl: audioUrl,
          voiceName: payload.voiceName,
          // チャンネル個別の設定にも反映
          'channelSettings.instagram.voiceUrl': audioUrl
        });
      }
    }

    return ok({
      ok: true,
      audioUrl,
      audioDataUrl,
      spokenText,
      segmentReadings,
      subtitleTimings,
      timingAlignedBy,
      readingResolvedBy: resolvedBy,
      checkedReadings,
      remainingKanjiCount
    });
  } catch (error) {
    console.error('Error generating voice:', error);
    if (error.name === 'ZodError') {
      return badRequest(error.issues.map(issue => issue.message).join(', '));
    }
    return json(500, { error: error.message || 'Failed to generate voice' });
  }
};
