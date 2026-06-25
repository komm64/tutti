import type { ImageAttachment, PlatformId } from '../messages';
import type { PlatformAdapter } from '../adapters/types';
import { getAdapter } from '../adapters/registry';
import { getSettings } from '../storage';
import { getEffectiveVideoConstraints } from '../utils/effective-limits';
import {
  attachmentSize,
  resolveAttachmentToBase64,
} from '../utils/attachment';
import { putBinary, deleteBinary } from '../utils/binary-transfer';
import { base64ToUint8Array } from '../utils/base64';
import { resizeImageInSW } from '../utils/image-resize';
import { letterboxToSquare } from '../utils/image-letterbox';
import { log } from '../utils/logger';
import { t } from '../utils/i18n';

export interface MediaPreprocessHooks {
  onConversionFinished?: () => void;
}

const VIDEO_TARGET_BYTES_RATIO = 0.9;

export function resolveSafeVideoTargetBytes(
  currentBytes: number,
  minLimitBytes: number,
): number {
  if (!Number.isFinite(minLimitBytes)) return currentBytes;
  return Math.max(1, Math.floor(Math.min(currentBytes, minLimitBytes * VIDEO_TARGET_BYTES_RATIO)));
}

export function shouldTranscodeVideoForBudget(
  currentBytes: number,
  minLimitBytes: number,
  needsVerticalLetterbox: boolean,
  needsTrim: boolean,
  needsCodecTranscode = false,
  needsSafeFormatNormalize = false,
): boolean {
  if (needsVerticalLetterbox || needsTrim || needsCodecTranscode || needsSafeFormatNormalize) return true;
  if (!Number.isFinite(minLimitBytes)) return false;
  return currentBytes > resolveSafeVideoTargetBytes(currentBytes, minLimitBytes);
}

export function shouldNormalizeVideoForSafePosting(video: ImageAttachment): boolean {
  return video.type.startsWith('video/');
}

export function needsVideoCodecTranscodeForPlatforms(
  platforms: readonly PlatformId[],
  video: ImageAttachment,
): boolean {
  if (!platforms.includes('bluesky')) return false;
  const codec = (video.videoCodec ?? '').toLowerCase();
  const codecParams = (video.videoCodecParameters ?? '').toLowerCase();
  return codec === 'hevc' ||
    codec === 'h265' ||
    codecParams.startsWith('hev1') ||
    codecParams.startsWith('hvc1');
}

export async function maybeResizeImagesForPlatform(
  adapter: PlatformAdapter,
  images: ImageAttachment[],
): Promise<ImageAttachment[]> {
  const maxBytes = adapter.imageConstraints.maxBytesPerImage;
  if (!maxBytes) return images;

  const out: ImageAttachment[] = [];
  for (const img of images) {
    if (!img.type.startsWith('image/')) {
      out.push(img);
      continue;
    }
    // dataRef ベースの大きい画像は IDB から取り出して base64 化
    let data = img.data;
    if (!data && img.dataRef) {
      const resolved = await resolveAttachmentToBase64(img);
      data = resolved.data;
    }
    if (!data) {
      out.push(img); // resolve できなければ original そのまま
      continue;
    }
    try {
      const resized = await resizeImageInSW(data, img.type, maxBytes);
      if (resized === data) {
        out.push(img);
      } else {
        out.push({
          name: img.name.replace(/\.[^.]+$/, '.jpg'),
          type: 'image/jpeg',
          data: resized,
        });
      }
    } catch (e) {
      log.warn(`${adapter.id}: per-platform resize 失敗、 original で送信: ${e instanceof Error ? e.message : String(e)}`);
      out.push(img);
    }
  }
  return out;
}

export async function maybeCompressVideoForBudget(
  platforms: PlatformId[],
  images?: ImageAttachment[],
  trimToSeconds?: number,
  hooks: MediaPreprocessHooks = {},
): Promise<ImageAttachment[] | undefined> {
  if (!images || images.length === 0) return images;
  const videoIdx = images.findIndex((m) => m.type.startsWith('video/'));
  if (videoIdx < 0) return images;
  const video = images[videoIdx]!;
  const currentBytes = attachmentSize(video);
  const minBytes = await resolveMinVideoBytes(platforms);

  // v0.4.81: Settings.autoLetterboxVerticalVideo が ON で、 選択中に縦動画 SNS
  // (TikTok / YouTube Shorts / IG Reels) が含まれる場合は **size が範囲内でも
  // 9:16 letterbox のため再エンコードする**。
  const { autoLetterboxVerticalVideo } = await getSettings();
  const verticalSns: PlatformId[] = ['tiktok', 'youtube', 'instagram'];
  const needsVerticalLetterbox =
    autoLetterboxVerticalVideo && platforms.some((p) => verticalSns.includes(p));

  // v0.4.90: trim opt-in
  const needsTrim = !!(trimToSeconds && trimToSeconds > 0 && (video.durationS ?? 0) > trimToSeconds);
  const needsCodecTranscode = needsVideoCodecTranscodeForPlatforms(platforms, video);
  const needsSafeFormatNormalize = shouldNormalizeVideoForSafePosting(video);

  if (!shouldTranscodeVideoForBudget(
    currentBytes,
    minBytes,
    needsVerticalLetterbox,
    needsTrim,
    needsCodecTranscode,
    needsSafeFormatNormalize,
  )) {
    return images;
  }

  const targetBytes = resolveSafeVideoTargetBytes(currentBytes, minBytes);
  const aspectMode: 'passthrough' | 'vertical9x16' = needsVerticalLetterbox ? 'vertical9x16' : 'passthrough';
  log.info(`P16/P81: video ${(currentBytes / 1024 / 1024).toFixed(1)}MB → 目標 ${(targetBytes / 1024 / 1024).toFixed(1)}MB${Number.isFinite(minBytes) ? ` (limit ${(minBytes / 1024 / 1024).toFixed(1)}MB)` : ''}${needsSafeFormatNormalize ? ' + safe mp4/h264/aac' : ''}${needsVerticalLetterbox ? ' + 9:16 letterbox' : ''}${needsTrim ? ` + trim to ${trimToSeconds}s` : ''}${needsCodecTranscode ? ` + codec ${video.videoCodec ?? video.videoCodecParameters ?? 'unknown'}→h264` : ''}`);

  let inputRef = video.dataRef;
  let inputRefOwned = false;
  if (!inputRef) {
    if (!video.data) {
      throw new Error(t('runtimeVideoAttachmentMissing'));
    }
    inputRef = await putBinary(base64ToUint8Array(video.data));
    inputRefOwned = true;
  }

  try {
    const compressed = await runOffscreenCompress({
      inputRef,
      mimeType: video.type,
      durationS: video.durationS ?? 0,
      targetBytes,
      aspectMode,
      trimToSeconds: needsTrim ? trimToSeconds : undefined,
    }, hooks);
    log.info(`P16: 圧縮完了 ${(compressed.outputBytes / 1024 / 1024).toFixed(1)}MB`);
    if (Number.isFinite(minBytes) && compressed.outputBytes > minBytes) {
      throw new Error(`compressed video still exceeds platform limit: ${compressed.outputBytes} > ${minBytes}`);
    }
    const newImages = images.slice();
    newImages[videoIdx] = {
      name: video.name,
      type: 'video/mp4',
      durationS: video.durationS,
      videoCodec: 'avc',
      dataRef: compressed.outputRef,
      bytes: compressed.outputBytes,
    };
    return newImages;
  } catch (err) {
    // 旧コードはここで silent fallthrough して元動画で投稿試行 → constraint check で
    // 「151MB > 50MB」のような誤解しやすい error が出ていた。
    const detail = err instanceof Error ? err.message : String(err);
    log.error(`P16: 圧縮失敗 - ${detail}`);
    throw new Error(t('runtimeVideoCompressionFailed', detail));
  } finally {
    if (inputRefOwned && inputRef) await deleteBinary(inputRef).catch(() => {});
  }
}

export async function letterboxImagesForInstagram(
  images: ImageAttachment[],
): Promise<ImageAttachment[]> {
  return await Promise.all(
    images.map(async (img) => {
      try {
        let data = img.data;
        if (!data) {
          const resolved = await resolveAttachmentToBase64(img);
          data = resolved.data;
        }
        if (!data) throw new Error('letterbox: data missing after resolve');
        const out = await letterboxToSquare(data, img.type);
        if (!out.changed) return img;
        return {
          name: img.name.replace(/\.[^.]+$/, '.jpg'),
          type: out.type,
          data: out.data,
        };
      } catch (e) {
        log.warn(`IG letterbox 失敗、元画像で続行: ${e instanceof Error ? e.message : String(e)}`);
        return img;
      }
    }),
  );
}

async function resolveMinVideoBytes(platforms: readonly PlatformId[]): Promise<number> {
  let minBytes = Infinity;
  for (const p of platforms) {
    const a = getAdapter(p);
    if (!a?.videoConstraints) continue;
    const eff = await getEffectiveVideoConstraints(p, a.videoConstraints);
    if (!eff.maxBytes) continue;
    if (eff.maxBytes < minBytes) minBytes = eff.maxBytes;
  }
  return minBytes;
}

interface OffscreenApi {
  createDocument(opts: { url: string; reasons: string[]; justification: string }): Promise<void>;
  hasDocument?: () => Promise<boolean>;
}

const offscreenApi: OffscreenApi | undefined = (
  globalThis as unknown as { chrome?: { offscreen?: OffscreenApi } }
).chrome?.offscreen;

let offscreenReady: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  if (offscreenReady) return offscreenReady;
  if (!offscreenApi) throw new Error(t('runtimeOffscreenUnavailable'));
  offscreenReady = (async () => {
    const exists = offscreenApi.hasDocument ? await offscreenApi.hasDocument() : false;
    if (exists) return;
    await offscreenApi.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'ffmpeg.wasm video transcoding for size compression',
    });
  })();
  try {
    await offscreenReady;
  } catch (e) {
    offscreenReady = null;
    throw e;
  }
}

async function runOffscreenCompress(
  req: {
    inputRef: string;
    mimeType: string;
    durationS: number;
    targetBytes: number;
    aspectMode?: 'passthrough' | 'vertical9x16';
    trimToSeconds?: number;
  },
  hooks: MediaPreprocessHooks,
): Promise<{ outputRef: string; outputBytes: number }> {
  await ensureOffscreen();
  try {
    const res = (await browser.runtime.sendMessage({
      type: 'CONVERT_VIDEO',
      inputRef: req.inputRef,
      mimeType: req.mimeType,
      durationS: req.durationS,
      targetBytes: req.targetBytes,
      aspectMode: req.aspectMode,
      trimToSeconds: req.trimToSeconds,
    })) as { type: string; outputRef?: string; outputBytes?: number; error?: string } | undefined;
    if (!res || res.type === 'CONVERSION_ERROR' || !res.outputRef) {
      throw new Error(res?.error ?? t('runtimeConversionNoResponse'));
    }
    return { outputRef: res.outputRef, outputBytes: res.outputBytes ?? 0 };
  } finally {
    hooks.onConversionFinished?.();
    void browser.runtime.sendMessage({ type: 'CONVERSION_COMPLETE' }).catch(() => { /* popup 閉じてれば失敗、無視 */ });
  }
}
