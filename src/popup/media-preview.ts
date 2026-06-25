import type { ImagePreview, VideoPreview } from './types';
import { arrayBufferToBase64, base64ToUint8Array } from '../utils/base64';

export interface DraftImageMedia {
  name: string;
  type: string;
  data: string;
}

export interface DraftVideoMedia extends DraftImageMedia {
  durationS?: number;
  videoCodec?: string;
  videoCodecParameters?: string;
}

export async function createImagePreview(file: File): Promise<ImagePreview> {
  return {
    name: file.name,
    type: file.type,
    data: arrayBufferToBase64(await file.arrayBuffer()),
    previewUrl: URL.createObjectURL(file),
  };
}

export async function createVideoPreview(file: File): Promise<VideoPreview> {
  const metadata = await getVideoMetadata(file);
  return {
    name: file.name,
    type: file.type,
    data: arrayBufferToBase64(await file.arrayBuffer()),
    previewUrl: URL.createObjectURL(file),
    durationS: metadata.durationS,
    ...(metadata.videoCodec ? { videoCodec: metadata.videoCodec } : {}),
    ...(metadata.videoCodecParameters ? { videoCodecParameters: metadata.videoCodecParameters } : {}),
  };
}

export function restoreImagePreviews(images: readonly DraftImageMedia[] | undefined): ImagePreview[] {
  return (images ?? []).map((media) => {
    const blob = base64Blob(media.data, media.type);
    return {
      name: media.name,
      type: media.type,
      data: media.data,
      previewUrl: URL.createObjectURL(blob),
    };
  });
}

export function restoreVideoPreview(video: DraftVideoMedia | null | undefined): VideoPreview | null {
  if (!video) return null;
  const blob = base64Blob(video.data, video.type);
  return {
    name: video.name,
    type: video.type,
    data: video.data,
    previewUrl: URL.createObjectURL(blob),
    durationS: video.durationS ?? 0,
    ...(video.videoCodec ? { videoCodec: video.videoCodec } : {}),
    ...(video.videoCodecParameters ? { videoCodecParameters: video.videoCodecParameters } : {}),
  };
}

export function serializeImagesForDraft(images: readonly ImagePreview[]): DraftImageMedia[] {
  return images.map((img) => ({
    name: img.name,
    type: img.type,
    data: img.data,
  }));
}

export function serializeVideoForDraft(video: VideoPreview | null): DraftVideoMedia | null {
  return video
    ? {
        name: video.name,
        type: video.type,
        data: video.data,
        durationS: video.durationS,
        ...(video.videoCodec ? { videoCodec: video.videoCodec } : {}),
        ...(video.videoCodecParameters ? { videoCodecParameters: video.videoCodecParameters } : {}),
      }
    : null;
}

export function revokeImagePreview(image: ImagePreview | undefined): void {
  if (image) URL.revokeObjectURL(image.previewUrl);
}

export function revokeImagePreviews(images: readonly ImagePreview[]): void {
  for (const image of images) revokeImagePreview(image);
}

export function revokeVideoPreview(video: VideoPreview | null | undefined): void {
  if (video) URL.revokeObjectURL(video.previewUrl);
}

export function isFileDrag(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
}

export function filesFromClipboardItems(items: DataTransferItemList | undefined): File[] {
  if (!items || items.length === 0) return [];
  const files: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue;
    if (!item.type.startsWith('image/') && !item.type.startsWith('video/')) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

function base64Blob(data: string, type: string): Blob {
  const bytes = base64ToUint8Array(data);
  return new Blob([bytes as BlobPart], { type });
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve(video.duration);
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => resolve(0);
    video.src = URL.createObjectURL(file);
  });
}

async function getVideoMetadata(file: File): Promise<{
  durationS: number;
  videoCodec?: string;
  videoCodecParameters?: string;
}> {
  const fallbackDuration = () => getVideoDuration(file);
  try {
    const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
    const input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });
    const [track, duration] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.computeDuration().catch(() => null),
    ]);
    const [videoCodec, videoCodecParameters] = track
      ? await Promise.all([
          track.getCodec().catch(() => null),
          track.getCodecParameterString().catch(() => null),
        ])
      : [null, null];
    const durationS = typeof duration === 'number' && Number.isFinite(duration)
      ? duration
      : await fallbackDuration();
    return {
      durationS,
      ...(videoCodec ? { videoCodec } : {}),
      ...(videoCodecParameters ? { videoCodecParameters } : {}),
    };
  } catch {
    return { durationS: await fallbackDuration() };
  }
}
