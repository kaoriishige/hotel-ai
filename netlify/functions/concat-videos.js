const { startRenderVideo } = require('./_lib-endo/render-video');
const { getBucket, getDb } = require('./_lib-endo/firebase-admin');
const crypto = require('crypto');
const path = require('path');

exports.handler = async (event, context) => {
  // CORSヘッダー
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      video1Data, // Base64 or URL
      video2Data, // Base64 or URL
      video1Url: rawVideo1Url,
      video2Url: rawVideo2Url,
      duration1Sec = 15,
      duration2Sec = 15,
      transitionType = 'crossfade',
      transitionDurationSec = 0.5,
      bgmUrl = '',
      showBranding = true,
      submissionId: providedId
    } = body;

    const fps = 30;
    const duration1InFrames = Math.max(30, Math.round(duration1Sec * fps));
    const duration2InFrames = Math.max(30, Math.round(duration2Sec * fps));
    const transitionDurationInFrames = Math.max(0, Math.round(transitionDurationSec * fps));

    const submissionId = providedId || `concat_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const bucket = getBucket();

    // 動画1のURL解決（Base64の場合はStorageへ保存）
    let video1Url = rawVideo1Url;
    if (!video1Url && video1Data) {
      if (video1Data.startsWith('http://') || video1Data.startsWith('https://')) {
        video1Url = video1Data;
      } else if (bucket) {
        // Base64アップロード
        const buffer = Buffer.from(video1Data.replace(/^data:video\/\w+;base64,/, ''), 'base64');
        const filePath = `submissions/clips/${submissionId}_part1.mp4`;
        const file = bucket.file(filePath);
        await file.save(buffer, { metadata: { contentType: 'video/mp4' } });
        await file.makePublic().catch(() => {});
        video1Url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
      }
    }

    // 動画2のURL解決（Base64の場合はStorageへ保存）
    let video2Url = rawVideo2Url;
    if (!video2Url && video2Data) {
      if (video2Data.startsWith('http://') || video2Data.startsWith('https://')) {
        video2Url = video2Data;
      } else if (bucket) {
        // Base64アップロード
        const buffer = Buffer.from(video2Data.replace(/^data:video\/\w+;base64,/, ''), 'base64');
        const filePath = `submissions/clips/${submissionId}_part2.mp4`;
        const file = bucket.file(filePath);
        await file.save(buffer, { metadata: { contentType: 'video/mp4' } });
        await file.makePublic().catch(() => {});
        video2Url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
      }
    }

    if (!video1Url || !video2Url) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '2つの動画（動画1・動画2）を指定してください。' })
      };
    }

    const inputProps = {
      video1Url,
      video2Url,
      duration1InFrames,
      duration2InFrames,
      transitionType,
      transitionDurationInFrames,
      bgmUrl,
      showBranding
    };

    console.log(`[ConcatVideos] Starting concat render for ${submissionId}...`, inputProps);

    const renderResult = await startRenderVideo(submissionId, inputProps, 'EndoConcatenatedReel');

    // Firestoreに結合メタデータを記録（可能な場合）
    const db = getDb();
    if (db) {
      await db.collection('submissions').doc(submissionId).set({
        type: 'concatenated_reel',
        status: renderResult.mode === 'aws' ? 'rendering' : 'ready',
        video1Url,
        video2Url,
        videoUrl: renderResult.videoUrl || '',
        renderId: renderResult.renderId || '',
        renderMode: renderResult.mode,
        props: inputProps,
        createdAt: new Date().toISOString()
      }, { merge: true }).catch(err => console.warn('Firestore write failed:', err.message));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        submissionId,
        videoUrl: renderResult.videoUrl || '',
        renderId: renderResult.renderId || '',
        mode: renderResult.mode,
        message: renderResult.videoUrl ? '動画の結合が完了しました。' : 'レンダリングを開始しました。'
      })
    };
  } catch (error) {
    console.error('[ConcatVideos Error]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || '動画の結合に失敗しました' })
    };
  }
};
