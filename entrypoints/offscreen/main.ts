/**
 * P7: 動画整形 (letterbox + blur) offscreen document
 *
 * 実装手順:
 *   1. npm install @ffmpeg/ffmpeg @ffmpeg/core
 *   2. @ffmpeg/core の ffmpeg-core.js / ffmpeg-core.wasm を public/ffmpeg/ にコピー
 *   3. 下記 TODO を実装する (~30MB の wasm をバンドルするため実機テスト必須)
 *
 * ffmpeg フィルタグラフ例 (16:9 letterbox + ぼかし背景):
 *   [0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black[fg];
 *   [0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=40:40[bg];
 *   [bg][fg]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2
 */

import type { ConvertVideoMessage, Message } from '../../src/messages';

browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
  const msg = rawMsg as Message;
  if (msg.type !== 'CONVERT_VIDEO') return;

  void handleConversion(msg)
    .then((videoData) => sendResponse({ type: 'CONVERSION_COMPLETE', videoData }))
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      sendResponse({ type: 'CONVERSION_ERROR', error });
    });

  return true;
});

async function handleConversion(msg: ConvertVideoMessage): Promise<ArrayBuffer> {
  // TODO P7: FFmpeg を初期化して変換を実行する
  //
  // import { FFmpeg } from '@ffmpeg/ffmpeg';
  // const ffmpeg = new FFmpeg();
  // ffmpeg.on('progress', ({ progress }) => {
  //   void browser.runtime.sendMessage({ type: 'CONVERSION_PROGRESS', progress });
  // });
  // await ffmpeg.load({
  //   coreURL: browser.runtime.getURL('ffmpeg/ffmpeg-core.js'),
  //   wasmURL: browser.runtime.getURL('ffmpeg/ffmpeg-core.wasm'),
  // });
  // await ffmpeg.writeFile('input.mp4', new Uint8Array(msg.videoData));
  // await ffmpeg.exec(['-i', 'input.mp4', ...buildFilterArgs(msg.targetAspectRatio), 'output.mp4']);
  // const data = await ffmpeg.readFile('output.mp4');
  // return (data as Uint8Array).buffer;

  void msg; // suppress unused warning until implemented
  throw new Error('P7 未実装: ffmpeg.wasm のセットアップが必要です');
}
