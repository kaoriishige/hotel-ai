import { registerRoot, Composition } from 'remotion';
import { getAudioDurationInSeconds } from '@remotion/media-utils';
import { EndoReel, EndoReelProps } from './EndoReel';
import { ConcatenatedReel, ConcatenatedReelProps } from './ConcatenatedReel';
import React from 'react';

export const RemotionVideo: React.FC = () => {
  return (
    <>
      {/* 既存のAIアバター・思想リール動画 */}
      <Composition
        id="EndoInstagramReel"
        component={EndoReel}
        durationInFrames={1800} // デフォルトフォールバック
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          hookText: '【必見】温泉に行く前に知っておくべき3つのこと',
          text: '世界中を植林し、命を育んできた私が、最後にたどり着いたのは、この山奥の「枯れ葉」の美しさでした。効率だけを求める世界では見落とされてしまう、静かな命の循環が、ここにはあります。',
          voiceUrl: '',
          bgmUrl: '',
          backgroundUrl: ''
        }}
        calculateMetadata={async ({ props }) => {
          const fps = 30;
          let duration = 1800; // デフォルト60秒
          
          if (props.voiceUrl) {
            try {
              let audioUrl = props.voiceUrl;
              if (audioUrl.startsWith('/')) {
                audioUrl = 'https://akasawa.netlify.app' + audioUrl;
              }
              const durationSec = await getAudioDurationInSeconds(audioUrl);
              // 音声の長さに合わせて動画の全体のフレーム数を決定（＋余白として1秒分 ＋ 冒頭のフック表示用3秒を追加）
              duration = Math.ceil((durationSec + 3) * fps) + 30;
            } catch (err) {
              console.warn("Failed to fetch audio duration, using default", err);
            }
          }
          return {
            durationInFrames: duration,
            props: { ...props }
          };
        }}
      />

      {/* 🎬 2本のショート動画を接続・結合するコンポジション */}
      <Composition
        id="EndoConcatenatedReel"
        component={ConcatenatedReel}
        durationInFrames={900} // デフォルト30秒 (15秒+15秒)
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          video1Url: '',
          video2Url: '',
          duration1InFrames: 450,
          duration2InFrames: 450,
          transitionType: 'crossfade' as const,
          transitionDurationInFrames: 15,
          bgmUrl: '',
          bgmVolume: 0.2,
          video1Volume: 1.0,
          video2Volume: 1.0,
          showBranding: true
        }}
        calculateMetadata={async ({ props }) => {
          const dur1 = props.duration1InFrames || 450;
          const dur2 = props.duration2InFrames || 450;
          const trans = props.transitionType === 'crossfade' ? (props.transitionDurationInFrames || 15) : 0;
          const totalFrames = Math.max(30, (dur1 + dur2) - trans);

          return {
            durationInFrames: totalFrames,
            props: { ...props }
          };
        }}
      />
    </>
  );
};

registerRoot(RemotionVideo);

