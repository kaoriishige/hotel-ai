const { generateVoiceFromText } = require('./_lib/gemini-tts');
const { generateVoiceFromCartesia } = require('./_lib/cartesia-tts');
const { resolveJapaneseReading } = require('./_lib/reading-resolver');
const { getDb } = require('./_lib/firebase-admin');
const { ok, badRequest, methodNotAllowed, parseBody, json } = require('./_lib/helpers');
const { z } = require('zod');

const schema = z.object({
  text: z.string().min(1, 'Text is required'),
  submissionId: z.string().optional(),
  voiceName: z.string().optional().default('Charon')
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({ ok: true });
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  try {
    const payload = schema.parse(parseBody(event));
    const filename = `voice_${payload.submissionId || Date.now()}_${payload.voiceName}.wav`;

    // 裏側で漢字・難読地名・固有名詞の読み方を調査し、音声合成用の正確なかなテキストへ変換
    const { spokenText, resolvedBy } = await resolveJapaneseReading(payload.text);
    console.log(`[generate-voice] reading resolved by ${resolvedBy}: "${spokenText.substring(0, 40)}..."`);

    // Cartesia の設定が存在する場合は Cartesia API で遠藤正俊クローン音声を生成し、
    // そうでない場合は従来どおり Gemini API で生成する
    let audioUrl;
    let audioDataUrl = null;
    if (process.env.CARTESIA_API_KEY && process.env.CARTESIA_VOICE_ID) {
      const result = await generateVoiceFromCartesia(spokenText, filename, { returnDetails: true });
      audioUrl = result.audioUrl;
      audioDataUrl = result.audioDataUrl;
    } else {
      audioUrl = await generateVoiceFromText(spokenText, filename, payload.voiceName);
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

    return ok({ ok: true, audioUrl, audioDataUrl, spokenText, readingResolvedBy: resolvedBy });
  } catch (error) {
    console.error('Error generating voice:', error);
    if (error.name === 'ZodError') {
      return badRequest(error.issues.map(issue => issue.message).join(', '));
    }
    return json(500, { error: error.message || 'Failed to generate voice' });
  }
};
