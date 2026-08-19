import React from 'react';
import {
  AbsoluteFill,
  Video,
  Audio,
  useCurrentFrame,
  useVideoConfig,
  Series,
  interpolate,
  staticFile
} from 'remotion';

export interface ConcatenatedReelProps {
  video1Url: string;
  video2Url: string;
  duration1InFrames?: number; // 動画1のフレーム数
  duration2InFrames?: number; // 動画2のフレーム数
  transitionType?: 'cut' | 'fade' | 'crossfade'; // 繋ぎ目演出
  transitionDurationInFrames?: number; // トランジションの長さ（フレーム）
  bgmUrl?: string; // 全体を通して流すBGM（任意）
  bgmVolume?: number; // BGM音量 (0.0 - 1.0)
  video1Volume?: number; // 動画1の音量
  video2Volume?: number; // 動画2の音量
  showBranding?: boolean; // オーナー哲学ブランド透かしを表示するか
}

export const ConcatenatedReel: React.FC<ConcatenatedReelProps> = ({
  video1Url,
  video2Url,
  duration1InFrames = 450, // デフォルト15秒 (30fps)
  duration2InFrames = 450, // デフォルト15秒 (30fps)
  transitionType = 'crossfade',
  transitionDurationInFrames = 15, // 0.5秒
  bgmUrl,
  bgmVolume = 0.25,
  video1Volume = 1.0,
  video2Volume = 1.0,
  showBranding = true
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // アセットURLの解決ヘルパー
  const resolveAssetUrl = (url: string | undefined) => {
    if (!url) return undefined;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      return url;
    }
    const cleaned = url.startsWith('/') ? url.substring(1) : url;
    return staticFile(cleaned);
  };

  const resolvedVideo1 = resolveAssetUrl(video1Url);
  const resolvedVideo2 = resolveAssetUrl(video2Url);
  const resolvedBgm = resolveAssetUrl(bgmUrl);

  const transDuration = transitionType === 'cut' ? 0 : transitionDurationInFrames;

  // Seriesで動画1と動画2を順次配置
  // crossfadeの場合は動画1の終盤と動画2の序盤を重ねる
  return (
    <AbsoluteFill style={{ backgroundColor: '#07090e', overflow: 'hidden', fontFamily: '"Shippori Mincho", "Noto Serif JP", serif' }}>
      {/* 確実に明朝体を読み込むためのGoogle Fontsインポート */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600;800&family=Cinzel:wght@500;700&display=swap');
      `}</style>

      {/* 2本の動画を直列配置 */}
      <Series>
        {/* 動画 1 (前編) */}
        <Series.Sequence durationInFrames={duration1InFrames}>
          <VideoClip
            src={resolvedVideo1 || ''}
            volume={video1Volume}
            isFirst
            isLast={false}
            durationInFrames={duration1InFrames}
            transitionType={transitionType}
            transitionDuration={transDuration}
          />
        </Series.Sequence>

        {/* 動画 2 (後編) */}
        <Series.Sequence
          durationInFrames={duration2InFrames}
          offset={transitionType === 'crossfade' ? -transDuration : 0}
        >
          <VideoClip
            src={resolvedVideo2 || ''}
            volume={video2Volume}
            isFirst={false}
            isLast
            durationInFrames={duration2InFrames}
            transitionType={transitionType}
            transitionDuration={transDuration}
          />
        </Series.Sequence>
      </Series>

      {/* 全体BGM (任意) */}
      {resolvedBgm && (
        <Audio
          src={resolvedBgm}
          volume={bgmVolume}
          loop
        />
      )}

      {/* プレミアムシネマティックフレーム（和風ゴールドライン） */}
      {showBranding && (
        <>
          <AbsoluteFill style={{
            border: '20px solid #0c0e14',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 30
          }}>
            <div style={{
              width: '100%',
              height: '100%',
              border: '1px solid rgba(212, 175, 55, 0.35)',
              boxSizing: 'border-box'
            }} />
          </AbsoluteFill>

          {/* 右上：遠藤正俊オーナー思想・人生哲学ロゴ */}
          <div style={{
            position: 'absolute',
            top: '40px',
            right: '40px',
            color: 'rgba(212, 175, 55, 0.85)',
            fontFamily: 'Cinzel, serif',
            fontSize: '13px',
            letterSpacing: '0.25em',
            zIndex: 35,
            writingMode: 'vertical-rl',
            textShadow: '0 2px 10px rgba(0,0,0,0.8)'
          }}>
            ENDO MASATOSHI
          </div>

          {/* 左下：思想テーマ署名 */}
          <div style={{
            position: 'absolute',
            bottom: '40px',
            left: '40px',
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: '12px',
            fontFamily: '"Shippori Mincho", "Noto Serif JP", serif',
            letterSpacing: '0.15em',
            zIndex: 35,
            textShadow: '0 2px 10px rgba(0,0,0,0.9)'
          }}>
            遠藤正俊 — 人生の軸と余白
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

interface VideoClipProps {
  src: string;
  volume: number;
  durationInFrames: number;
  isFirst: boolean;
  isLast: boolean;
  transitionType: 'cut' | 'fade' | 'crossfade';
  transitionDuration: number;
}

const VideoClip: React.FC<VideoClipProps> = ({
  src,
  volume,
  durationInFrames,
  isFirst,
  isLast,
  transitionType,
  transitionDuration
}) => {
  const frame = useCurrentFrame();

  let opacity = 1;

  if (transitionType === 'fade') {
    // 黒フェードアウト / フェードイン
    if (!isFirst && frame < transitionDuration) {
      opacity = interpolate(frame, [0, transitionDuration], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp'
      });
    }
    if (!isLast && frame > durationInFrames - transitionDuration) {
      opacity = interpolate(
        frame,
        [durationInFrames - transitionDuration, durationInFrames],
        [1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      );
    }
  } else if (transitionType === 'crossfade') {
    // クロスフェード（後のクリップがフェードイン）
    if (!isFirst && frame < transitionDuration) {
      opacity = interpolate(frame, [0, transitionDuration], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp'
      });
    }
  }

  if (!src) {
    return (
      <AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e293b' }}>
        <p style={{ color: '#94a3b8', fontSize: '24px' }}>動画を読み込めません</p>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ opacity }}>
      <Video
        src={src}
        volume={volume}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
      />
    </AbsoluteFill>
  );
};

export default ConcatenatedReel;
