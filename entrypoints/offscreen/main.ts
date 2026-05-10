/**
 * 動画圧縮 offscreen document (P16: サイズ目標で再エンコード)
 *
 * background から CONVERT_VIDEO を受け取り、ffmpeg.wasm で h.264 + aac に
 * 再エンコード。target bitrate を `(targetBytes*8/durationS) - audioKbps` で
 * 求めて 1-pass 圧縮。終わったら base64 で返す。
 *
 * ## なぜ offscreen か
 * - background (service worker) は 30s で sleep するため重処理に向かない
 * - ffmpeg.wasm は WebAssembly + Worker。offscreen document なら DOM 完全環境
 * - popup は閉じると死ぬので長時間処理はここ
 *
 * ## ffmpeg core
 * - public/ffmpeg/ffmpeg-core.{js,wasm} に同梱 (~30MB)
 * - browser.runtime.getURL で extension 内のローカル URL を生成して渡す
 *
 * ## scope (v1)
 * - 入力: 任意の動画 (mp4 推奨、webm 等も h.264 にトランスコードされる)
 * - 出力: mp4 / h.264 / aac 128k / +faststart
 * - サイズ目標: targetBytes 基準で video bitrate 計算
 * - アスペクト比 / letterbox / blur は **触らない** (元の解像度を保つ、別タスクで)
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import type { ConvertVideoMessage, Message } from '../../src/messages';
import { getBinary, putBinary } from '../../src/utils/binary-transfer';
import { initLogLevelFromSettings, log } from '../../src/utils/logger';

void initLogLevelFromSettings();

const AUDIO_KBPS = 128;
const SAFETY_MARGIN = 0.92; // ffmpeg は target bitrate より少しオーバーすることがあるので余裕を持たせる
const MIN_VIDEO_KBPS = 200; // 200kbps を下回ると視認性が崩壊するので fallback

let ffmpegPromise: Promise<FFmpeg> | null = null;

async function getFfmpeg(): Promise<FFmpeg> {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    log.info('offscreen: ffmpeg.wasm load 開始');
    const ff = new FFmpeg();
    ff.on('progress', ({ progress }) => {
      void browser.runtime.sendMessage({
        type: 'CONVERSION_PROGRESS',
        progress: Math.max(0, Math.min(1, progress)),
        stage: 'transcode',
      });
    });
    ff.on('log', ({ message }) => {
      // ffmpeg 自身の stderr/stdout (バンドル log)。エラー診断に便利だが verbose
      log.debug(`ffmpeg: ${message}`);
    });
    void browser.runtime.sendMessage({ type: 'CONVERSION_PROGRESS', progress: 0, stage: 'load' });
    // public/ffmpeg/ は WXT の PublicPath 型推論に乗ってないので cast。
    // ビルド時に scripts/copy-ffmpeg.mjs が確実に配置するので runtime では存在する。
    const getUrl = browser.runtime.getURL as (p: string) => string;
    const coreURL = getUrl('/ffmpeg/ffmpeg-core.js');
    const wasmURL = getUrl('/ffmpeg/ffmpeg-core.wasm');
    // P19: core-mt は pthread worker URL を別途渡すと libx264 を並列化
    const workerURL = getUrl('/ffmpeg/ffmpeg-core.worker.js');
    log.info(`offscreen: ffmpeg load (core-mt) coreURL=${coreURL}, SAB=${typeof SharedArrayBuffer !== 'undefined'}, COI=${(globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated}`);
    try {
      await ff.load({ coreURL, wasmURL, workerURL });
      log.info('offscreen: ffmpeg.load (core-mt) 成功');
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      log.error(`offscreen: ffmpeg.load 失敗 — ${msg}`);
      throw new Error(`ffmpeg.load failed: ${msg}`);
    }
    return ff;
  })();
  try {
    return await ffmpegPromise;
  } catch (e) {
    ffmpegPromise = null; // 次回 retry 用に reset
    throw e;
  }
}

function computeVideoKbps(targetBytes: number, durationS: number): number {
  if (durationS <= 0) return MIN_VIDEO_KBPS;
  // total bitrate を計算 → audio 引いた残りが video
  const totalKbps = ((targetBytes * 8) / durationS / 1000) * SAFETY_MARGIN;
  return Math.max(Math.floor(totalKbps - AUDIO_KBPS), MIN_VIDEO_KBPS);
}

async function compressVideo(msg: ConvertVideoMessage): Promise<{ outputRef: string; size: number }> {
  const ff = await getFfmpeg();
  const inputBytes = await getBinary(msg.inputRef);
  const inputName = 'input.mp4';
  const outputName = 'output.mp4';

  // 既存ファイルが残っていたら掃除 (連続呼び出し時)
  try { await ff.deleteFile(inputName); } catch { /* ignore */ }
  try { await ff.deleteFile(outputName); } catch { /* ignore */ }

  await ff.writeFile(inputName, inputBytes);

  const videoKbps = computeVideoKbps(msg.targetBytes, msg.durationS);

  // ffmpeg コマンド (P19: core-mt + 全コア並列で速度最大化):
  // -threads 0: ffmpeg / libx264 が hardwareConcurrency を取って全コア並列化
  // -preset ultrafast: H.264 最速 preset
  // -tune fastdecode: Web 再生時のデコード負荷も軽減
  // -vf scale='min(1280,iw)': 1080p+ 入力を 720p まで縮小 (pixel 数 1/2.25)
  // -profile:v main + -pix_fmt yuv420p: 全 SNS 互換性確保
  // -movflags +faststart: moov atom を先頭にして Web 即再生
  await ff.exec([
    '-threads', '0',
    '-i', inputName,
    '-c:v', 'libx264',
    '-threads', '0',
    '-preset', 'ultrafast',
    '-tune', 'fastdecode',
    '-profile:v', 'main',
    '-pix_fmt', 'yuv420p',
    '-vf', "scale='min(1280,iw)':-2:force_original_aspect_ratio=decrease",
    '-b:v', `${videoKbps}k`,
    '-maxrate', `${Math.floor(videoKbps * 1.2)}k`,
    '-bufsize', `${videoKbps * 2}k`,
    '-c:a', 'aac',
    '-b:a', `${AUDIO_KBPS}k`,
    '-movflags', '+faststart',
    outputName,
  ]);

  const out = (await ff.readFile(outputName)) as Uint8Array;
  // ArrayBuffer は SharedArrayBuffer の場合があるので新規 ArrayBuffer に copy
  const buffer = new ArrayBuffer(out.byteLength);
  new Uint8Array(buffer).set(out);

  // クリーンアップ
  try { await ff.deleteFile(inputName); } catch { /* ignore */ }
  try { await ff.deleteFile(outputName); } catch { /* ignore */ }

  // 出力も IndexedDB binary-transfer 経由で background に渡す (sendMessage 64MB 回避)
  const outputRef = await putBinary(new Uint8Array(buffer));
  return { outputRef, size: out.byteLength };
}

browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
  const msg = rawMsg as Message;
  if (msg.type !== 'CONVERT_VIDEO') return;

  void compressVideo(msg)
    .then(({ outputRef, size }) =>
      sendResponse({ type: 'CONVERSION_COMPLETE', outputRef, outputBytes: size }),
    )
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      sendResponse({ type: 'CONVERSION_ERROR', error });
    });

  return true;
});
