import type { PlatformId } from '../types/platform';
import {
  getDraft,
  getSelectedPlatforms,
  saveDraft,
  saveSelectedPlatforms,
  type Draft,
  type SelectedPlatforms,
} from '../storage';
import {
  restoreImagePreviews,
  restoreVideoPreview,
  serializeImagesForDraft,
  serializeVideoForDraft,
} from './media-preview';
import {
  addFilesToMediaState,
  moveImageAt,
  removeImageAt,
  removeVideoFromState,
} from './media-state';
import type { ImagePreview, VideoPreview } from './types';

export interface ComposerDraftState {
  text: string;
  images: ImagePreview[];
  video: VideoPreview | null;
}

export interface ComposerDraftSnapshot {
  text: string;
  images: readonly ImagePreview[];
  video: VideoPreview | null;
}

export interface ComposerMediaState {
  images: ImagePreview[];
  video: VideoPreview | null;
  imageAlts: string[];
}

export interface ComposerControllerOptions {
  getDraft?: () => Promise<Draft | null>;
  saveDraft?: (draft: Draft) => Promise<void>;
  getSelectedPlatforms?: () => Promise<SelectedPlatforms | null>;
  saveSelectedPlatforms?: (selected: SelectedPlatforms) => Promise<void>;
  draftDebounceMs?: number;
  selectionDebounceMs?: number;
}

export function createComposerController(options: ComposerControllerOptions = {}) {
  const readDraft = options.getDraft ?? getDraft;
  const writeDraft = options.saveDraft ?? saveDraft;
  const readSelected = options.getSelectedPlatforms ?? getSelectedPlatforms;
  const writeSelected = options.saveSelectedPlatforms ?? saveSelectedPlatforms;
  const draftDebounceMs = options.draftDebounceMs ?? 300;
  const selectionDebounceMs = options.selectionDebounceMs ?? 200;
  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  let selectionTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    async loadDraft(): Promise<ComposerDraftState | null> {
      const draft = await readDraft();
      if (!draft) return null;
      return {
        text: draft.text,
        images: restoreImagePreviews(draft.images),
        video: restoreVideoPreview(draft.video),
      };
    },

    async loadSelectedPlatforms(
      defaults: Readonly<Record<PlatformId, boolean>>,
    ): Promise<Record<PlatformId, boolean>> {
      const stored = await readSelected();
      const selected = { ...defaults };
      if (!stored) return selected;
      for (const [key, value] of Object.entries(stored)) {
        if (typeof value === 'boolean' && key in selected) {
          selected[key as PlatformId] = value;
        }
      }
      return selected;
    },

    scheduleDraftSave(snapshot: ComposerDraftSnapshot): void {
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        draftTimer = undefined;
        void writeDraft({
          text: snapshot.text,
          images: serializeImagesForDraft(snapshot.images),
          video: serializeVideoForDraft(snapshot.video),
        });
      }, draftDebounceMs);
    },

    scheduleSelectedPlatformsSave(
      selected: Readonly<Record<PlatformId, boolean>>,
    ): void {
      if (selectionTimer) clearTimeout(selectionTimer);
      const snapshot = { ...selected };
      selectionTimer = setTimeout(() => {
        selectionTimer = undefined;
        void writeSelected(snapshot);
      }, selectionDebounceMs);
    },

    async saveSelectedPlatforms(
      selected: Readonly<Record<PlatformId, boolean>>,
    ): Promise<void> {
      if (selectionTimer) {
        clearTimeout(selectionTimer);
        selectionTimer = undefined;
      }
      await writeSelected({ ...selected });
    },

    async addFiles(
      state: ComposerMediaState,
      files: readonly File[],
    ): Promise<ComposerMediaState> {
      return await addFilesToMediaState(state, files);
    },

    removeImage(state: ComposerMediaState, index: number): ComposerMediaState {
      return removeImageAt(state, index);
    },

    moveImage(
      state: ComposerMediaState,
      index: number,
      delta: -1 | 1,
    ): ComposerMediaState {
      return moveImageAt(state, index, delta);
    },

    removeVideo(state: ComposerMediaState): ComposerMediaState {
      return removeVideoFromState(state);
    },

    setImageAlt(
      state: ComposerMediaState,
      index: number,
      value: string,
    ): ComposerMediaState {
      const imageAlts = state.imageAlts.slice();
      imageAlts[index] = value;
      return { ...state, imageAlts };
    },

    dispose(): void {
      if (draftTimer) clearTimeout(draftTimer);
      if (selectionTimer) clearTimeout(selectionTimer);
      draftTimer = undefined;
      selectionTimer = undefined;
    },
  };
}
