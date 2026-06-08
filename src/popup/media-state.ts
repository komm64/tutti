import { MAX_IMAGES } from './platforms';
import type { ImagePreview, VideoPreview } from './types';
import {
  createImagePreview,
  createVideoPreview,
  revokeImagePreview,
  revokeImagePreviews,
  revokeVideoPreview,
} from './media-preview';

export interface PopupMediaState {
  images: ImagePreview[];
  video: VideoPreview | null;
  imageAlts: string[];
}

export async function addFilesToMediaState(
  state: PopupMediaState,
  files: readonly File[],
): Promise<PopupMediaState> {
  if (files.length === 0) return state;

  const firstVideo = files.find((file) => file.type.startsWith('video/'));
  if (firstVideo) {
    revokeVideoPreview(state.video);
    revokeImagePreviews(state.images);
    return {
      images: [],
      video: await createVideoPreview(firstVideo),
      imageAlts: [],
    };
  }

  revokeVideoPreview(state.video);
  const slots = MAX_IMAGES - state.images.length;
  const toAdd = files.filter((file) => file.type.startsWith('image/')).slice(0, slots);
  const newPreviews = await Promise.all(toAdd.map((file) => createImagePreview(file)));
  return {
    images: [...state.images, ...newPreviews],
    video: null,
    imageAlts: state.video ? [] : state.imageAlts,
  };
}

export function removeImageAt(state: PopupMediaState, index: number): PopupMediaState {
  revokeImagePreview(state.images[index]);
  return {
    ...state,
    images: state.images.filter((_, i) => i !== index),
    imageAlts: state.imageAlts.filter((_, i) => i !== index),
  };
}

export function moveImageAt(state: PopupMediaState, index: number, delta: -1 | 1): PopupMediaState {
  const target = index + delta;
  if (target < 0 || target >= state.images.length) return state;

  const images = state.images.slice();
  [images[index], images[target]] = [images[target]!, images[index]!];
  const imageAlts = state.imageAlts.slice();
  [imageAlts[index], imageAlts[target]] = [imageAlts[target] ?? '', imageAlts[index] ?? ''];
  return { ...state, images, imageAlts };
}

export function removeVideoFromState(state: PopupMediaState): PopupMediaState {
  revokeVideoPreview(state.video);
  return { ...state, video: null };
}
