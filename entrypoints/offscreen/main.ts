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

const AUDIO_KBPS = 96; // 128k → 96k に削減、AAC LC で SNS 用途は十分
const SAFETY_MARGIN = 0.85; // ultrafast preset は target bitrate を 10-15% overshoot しがちなので margin 大きめ
const MIN_VIDEO_KBPS = 200; // 200kbps を下回ると視認性が崩壊するので fallback
const PASSTHROUGH_MAX_WIDTH = 854;
const OUTPUT_OVERSHOOT_MARGIN = 1.03;

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
    log.info(`offscreen: ffmpeg load (single-thread) coreURL=${coreURL}, SAB=${typeof SharedArrayBuffer !== 'undefined'}, COI=${(globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated}`);
    try {
      await ff.load({ coreURL, wasmURL });
      log.info('offscreen: ffmpeg.load (single-thread) 成功');
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
  const inputBytes = await getBinary(msg.inputRef);
  const videoKbps = computeVideoKbps(msg.targetBytes, msg.durationS);

  const fastPath = await tryCompressWithWebCodecs(msg, inputBytes, videoKbps);
  if (fastPath) return fastPath;

  const ff = await getFfmpeg();
  const inputName = 'input.mp4';
  const outputName = 'output.mp4';

  // 既存ファイルが残っていたら掃除 (連続呼び出し時)
  try { await ff.deleteFile(inputName); } catch { /* ignore */ }
  try { await ff.deleteFile(outputName); } catch { /* ignore */ }

  await ff.writeFile(inputName, inputBytes);

  // aspect mode 別の `-vf` filter (v0.4.81〜):
  // - passthrough: 横長 / 縦長 そのまま、 短辺 854px cap (= 480p)
  // - vertical9x16: 1080×1920 に letterbox + ぼかし背景 (TikTok/YT Shorts/IG Reels 向け)
  //   - split で 2 stream、 片方は scale+crop+blur で背景、 もう片方は scale 縮小して
  //     foreground、 overlay で中央配置。 IG image letterbox の動画版
  const aspect = msg.aspectMode ?? 'passthrough';
  const vfFilter = aspect === 'vertical9x16'
    ? "split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:1[bg];[b]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30"
    : "scale='min(854,iw)':-2,fps=30";

  // ffmpeg コマンド (single-thread でも実用速度を目指す):
  // -preset ultrafast: H.264 最速 preset
  // -tune zerolatency: lookahead 無効 (`zerolatency,fastdecode` のカンマ区切りは
  //   ffmpeg.wasm の x264 build で 0-byte silent fail、 v0.4.52)
  // -profile:v は指定しない (ultrafast 内部で baseline 相当を強制)
  // v0.4.90: trim opt-in。 trimToSeconds が指定されてれば先頭 N 秒で切る (-t)。
  // `-t` は output 側 (output filename の前) に置く必要がある。
  const trimArgs = msg.trimToSeconds && msg.trimToSeconds > 0
    ? ['-t', String(msg.trimToSeconds)]
    : [];

  await ff.exec([
    '-i', inputName,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-vf', vfFilter,
    '-g', '240',
    '-b:v', `${videoKbps}k`,
    '-maxrate', `${Math.floor(videoKbps * 1.1)}k`,
    '-bufsize', `${videoKbps * 2}k`,
    '-c:a', 'aac',
    '-b:a', `${AUDIO_KBPS}k`,
    '-movflags', '+faststart',
    ...trimArgs,
    outputName,
  ]);

  const out = (await ff.readFile(outputName)) as Uint8Array;
  log.info(`offscreen: ffmpeg.exec 完了 outputBytes=${out.byteLength} (kbps target=${videoKbps})`);
  if (out.byteLength === 0) {
    // 0-byte 出力は ffmpeg の引数不整合か入力 codec 非対応の silent failure。
    // putBinary すると content script 側で「missing data」assert が発火するので、
    // ここで明確に失敗させて popup にエラーを返す。
    throw new Error('ffmpeg produced a 0-byte output (invalid arguments or unsupported input codec)');
  }
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

async function tryCompressWithWebCodecs(
  msg: ConvertVideoMessage,
  inputBytes: Uint8Array,
  videoKbps: number,
): Promise<{ outputRef: string; size: number } | null> {
  if ((msg.aspectMode ?? 'passthrough') !== 'passthrough') {
    log.info('offscreen: WebCodecs fast path skip (vertical letterbox uses ffmpeg filters)');
    return null;
  }

  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') {
    log.info('offscreen: WebCodecs fast path unavailable');
    return null;
  }

  try {
    void browser.runtime.sendMessage({ type: 'CONVERSION_PROGRESS', progress: 0, stage: 'load' });
    const {
      ALL_FORMATS,
      BlobSource,
      BufferTarget,
      Conversion,
      Input,
      Mp4OutputFormat,
      Output,
      canEncodeAudio,
      canEncodeVideo,
    } = await import('mediabunny');

    const effectiveDuration = msg.trimToSeconds && msg.trimToSeconds > 0
      ? Math.min(msg.trimToSeconds, msg.durationS || msg.trimToSeconds)
      : msg.durationS;
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });
    const inputBuffer = new ArrayBuffer(inputBytes.byteLength);
    new Uint8Array(inputBuffer).set(inputBytes);
    const input = new Input({
      source: new BlobSource(new Blob([inputBuffer], { type: msg.mimeType || 'video/mp4' })),
      formats: ALL_FORMATS,
    });

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('no primary video track');

    const displayWidth = await videoTrack.getDisplayWidth();
    const displayHeight = await videoTrack.getDisplayHeight();
    const { width, height } = fitToMaxWidth(displayWidth, displayHeight, PASSTHROUGH_MAX_WIDTH);

    const videoBps = videoKbps * 1000;
    const audioBps = AUDIO_KBPS * 1000;
    const canEncodeAvc = await canEncodeVideo('avc', {
      width,
      height,
      bitrate: videoBps,
      hardwareAcceleration: 'prefer-hardware',
    });
    if (!canEncodeAvc) throw new Error(`H.264 WebCodecs encode unsupported at ${width}x${height}`);

    const audioTrack = await input.getPrimaryAudioTrack();
    const audioOptions = audioTrack
      ? (await canEncodeAudio('aac', { bitrate: audioBps })
          ? { codec: 'aac' as const, bitrate: audioBps, forceTranscode: true }
          : undefined)
      : { discard: true as const };
    if (audioTrack && !audioOptions) throw new Error('AAC WebCodecs encode unsupported');

    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: {
        codec: 'avc',
        width,
        frameRate: 30,
        bitrate: videoBps,
        keyFrameInterval: 8,
        hardwareAcceleration: 'prefer-hardware',
        forceTranscode: true,
      },
      audio: audioOptions,
      trim: effectiveDuration && effectiveDuration > 0 && effectiveDuration < msg.durationS
        ? { start: 0, end: effectiveDuration }
        : undefined,
      tags: {},
      showWarnings: false,
    });

    if (!conversion.isValid) {
      const discarded = conversion.discardedTracks
        .map((track) => `${track.track.id}:${track.reason}`)
        .join(', ');
      throw new Error(`invalid conversion${discarded ? ` (${discarded})` : ''}`);
    }

    conversion.onProgress = (progress) => {
      void browser.runtime.sendMessage({
        type: 'CONVERSION_PROGRESS',
        progress: Math.max(0, Math.min(1, progress)),
        stage: 'transcode',
      });
    };

    const startedAt = performance.now();
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength === 0) throw new Error('WebCodecs produced an empty output');
    if (buffer.byteLength > Math.floor(msg.targetBytes * OUTPUT_OVERSHOOT_MARGIN)) {
      throw new Error(`WebCodecs output exceeds target: ${buffer.byteLength} > ${msg.targetBytes}`);
    }

    const out = new Uint8Array(buffer);
    const outputRef = await putBinary(out);
    log.info(`offscreen: WebCodecs fast path 完了 outputBytes=${out.byteLength} ${(performance.now() - startedAt).toFixed(0)}ms (${width}x${height}, ${videoKbps}kbps)`);
    return { outputRef, size: out.byteLength };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    log.warn(`offscreen: WebCodecs fast path fallback to ffmpeg — ${detail}`);
    return null;
  }
}

function fitToMaxWidth(width: number, height: number, maxWidth: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: maxWidth, height: maxWidth };
  const outputWidth = Math.min(width, maxWidth);
  const scale = outputWidth / width;
  return {
    width: even(outputWidth),
    height: even(height * scale),
  };
}

function even(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
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
