import {
  clearDraftMedia,
  getDraftMedia,
  saveDraftMedia,
} from '../utils/draft-media-store';

export interface DraftMedia {
  name: string;
  type: string;
  data: string;
  durationS?: number;
}

export interface Draft {
  text: string;
  images?: DraftMedia[];
  video?: DraftMedia | null;
}

const DRAFT_KEY = 'draft';

export async function getDraft(): Promise<Draft | null> {
  const [stored, media] = await Promise.all([
    browser.storage.session.get(DRAFT_KEY),
    getDraftMedia(),
  ]);
  const text = (stored[DRAFT_KEY] as { text?: string } | undefined)?.text;
  if (typeof text !== 'string' && !media) return null;
  return {
    text: text ?? '',
    images: media?.images,
    video: media?.video ?? null,
  };
}

export async function saveDraft(draft: Draft): Promise<void> {
  const textOnly = { text: draft.text };
  const sessionPromise = browser.storage.session.set({ [DRAFT_KEY]: textOnly });
  const hasMedia = (draft.images && draft.images.length > 0) || draft.video;
  const mediaPromise = hasMedia
    ? saveDraftMedia({ images: draft.images, video: draft.video ?? null })
    : clearDraftMedia();

  await Promise.all([sessionPromise, mediaPromise.catch((error) => {
    console.warn('[Tutti] saveDraftMedia (IndexedDB) failed:', error);
  })]);
}

export async function clearDraft(): Promise<void> {
  await Promise.all([
    browser.storage.session.remove(DRAFT_KEY),
    clearDraftMedia(),
  ]);
}
