/**
 * 背景映像の指示（キーワード入力）検索API
 * 「日本の道路」「夜のドライブ」「那須の森」「箒川の渓流」などのキーワードから、
 * 日本仕様（左側通行）の走行動画や那須・塩原の自然映像を自動選定して返却する
 */

const BACKGROUND_VIDEO_LIBRARY = [
  {
    id: 'japan_road_day',
    title: '日本の田舎道・街道ドライブ（左側通行・日本仕様）',
    category: 'road',
    tags: ['日本の道路', 'ドライブ', '左側通行', '車窓', '田舎道'],
    description: '日本の道路規則に準拠した左車線走行の美しいドライブ風景。手前と対向車線の秩序が保たれた日本仕様映像。',
    isLeftHandTraffic: true,
    videoUrl: 'https://raw.githubusercontent.com/intel-iot-devkit/sample-videos/master/car-detection.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80',
    durationSec: 15
  },
  {
    id: 'japan_night_drive',
    title: '夜のドライブ・光の余白（街明かり・テールランプ・左側通行）',
    category: 'night_drive',
    tags: ['夜のドライブ', '夜', '車', '光', '静寂', '左側通行'],
    description: '静かな夜の車窓を彩る街の灯りとテールランプの光跡。思考を深める夜のドライブ映像。',
    isLeftHandTraffic: true,
    videoUrl: 'https://raw.githubusercontent.com/intel-iot-devkit/sample-videos/master/driver-action-recognition.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    durationSec: 20
  },
  {
    id: 'nasu_forest',
    title: '那須の深緑・木漏れ日の森（大自然の呼吸）',
    category: 'forest',
    tags: ['那須の森', '森', '木漏れ日', '新緑', '自然', '大自然', '樹木'],
    description: '木々の間から差し込む柔らかな光と風に揺れる葉。遠藤オーナーの哲学と響き合う深い森の映像。',
    isLeftHandTraffic: false,
    videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=800&q=80',
    durationSec: 15
  },
  {
    id: 'houki_river',
    title: '箒川の渓流・清流のせせらぎ（塩原の清らかな水）',
    category: 'river',
    tags: ['箒川の渓流', '箒川', '渓流', '川', 'せせらぎ', '清流', '水', '塩原'],
    description: '箒川沿いの一軒宿を象徴する清らかな渓流のせせらぎ。心を洗い流す水の流れ。',
    isLeftHandTraffic: false,
    videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=800&q=80',
    durationSec: 15
  },
  {
    id: 'silent_campfire',
    title: '静寂の焚き火・炎のゆらぎ（余白と休息の時間）',
    category: 'campfire',
    tags: ['焚き火', '火', '炎', '夜', '余白', '静けさ', 'マインドセット'],
    description: '暗闇の中に灯る穏やかな焚き火の炎。何もしない贅沢な時間を取り戻すシネマティック映像。',
    isLeftHandTraffic: false,
    videoUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Campfire_at_night_-_Claytor_Lake_State_Park_-_video.webm',
    thumbnailUrl: 'https://images.unsplash.com/photo-1475483768296-6163e08872a1?auto=format&fit=crop&w=800&q=80',
    durationSec: 18
  },
  {
    id: 'highland_morning',
    title: '那須連山・高原の朝と雲海（人生の視界を広げる）',
    category: 'mountain',
    tags: ['高原', '朝', '山', '雲海', '那須連山', '夜明け', '広大'],
    description: '澄み渡る高原の朝に広がる雲海と山並み。日常の喧騒から解放される圧倒的なスケール感。',
    isLeftHandTraffic: false,
    videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80',
    durationSec: 15
  }
];

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const params = event.queryStringParameters || {};
    let keyword = (params.keyword || '').trim().toLowerCase();
    
    if (event.body) {
      try {
        const body = JSON.parse(event.body);
        if (body.keyword) keyword = body.keyword.trim().toLowerCase();
      } catch (e) {}
    }

    console.log(`[SearchBackgroundVideos] Query keyword: "${keyword}"`);

    let results = [];

    if (!keyword) {
      results = BACKGROUND_VIDEO_LIBRARY;
    } else {
      // スコアリングマッチング
      results = BACKGROUND_VIDEO_LIBRARY.map(video => {
        let score = 0;
        const kw = keyword;
        
        // タグ完全一致・部分一致
        for (const tag of video.tags) {
          const t = tag.toLowerCase();
          if (kw.includes(t) || t.includes(kw)) score += 10;
        }

        // タイトル一致
        if (video.title.toLowerCase().includes(kw)) score += 8;
        // 説明文一致
        if (video.description.toLowerCase().includes(kw)) score += 5;

        // 特殊キーワード判定
        if ((kw.includes('車') || kw.includes('道路') || kw.includes('ドライブ') || kw.includes('走行') || kw.includes('交通') || kw.includes('左側')) && video.category.includes('road')) {
          score += 15;
        }
        if ((kw.includes('夜') || kw.includes('ナイト')) && (video.category.includes('night') || video.category.includes('campfire'))) {
          score += 12;
        }
        if ((kw.includes('森') || kw.includes('木') || kw.includes('那須') || kw.includes('緑')) && video.category === 'forest') {
          score += 15;
        }
        if ((kw.includes('川') || kw.includes('渓流') || kw.includes('水') || kw.includes('箒川')) && video.category === 'river') {
          score += 15;
        }
        if ((kw.includes('火') || kw.includes('焚き火') || kw.includes('炎')) && video.category === 'campfire') {
          score += 15;
        }

        return { ...video, score };
      })
      .filter(v => v.score > 0)
      .sort((a, b) => b.score - a.score);

      // マッチが0件の場合は全体を返す
      if (results.length === 0) {
        results = BACKGROUND_VIDEO_LIBRARY;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        keyword,
        count: results.length,
        videos: results
      })
    };
  } catch (err) {
    console.error('[SearchBackgroundVideos] Error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
