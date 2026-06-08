import { getPostHistory, type HistoryEntry } from '../storage';
import { getMedia } from '../utils/history-media';

export interface PopupHistoryThumbs {
  entries: HistoryEntry[];
  thumbs: Record<string, string[]>;
  objectUrls: string[];
}

export function revokeHistoryThumbUrls(urls: readonly string[]): void {
  for (const url of urls) URL.revokeObjectURL(url);
}

export async function loadPopupHistoryThumbs(limit = 5): Promise<PopupHistoryThumbs> {
  const entries = await getPostHistory();
  const thumbs: Record<string, string[]> = {};
  const objectUrls: string[] = [];

  for (const entry of entries.slice(0, limit)) {
    if (!entry.mediaRefs?.length) continue;
    const urls: string[] = [];
    for (const ref of entry.mediaRefs) {
      const blob = await getMedia(ref).catch(() => null);
      if (!blob?.type.startsWith('image/')) continue;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      objectUrls.push(url);
    }
    if (urls.length) thumbs[entry.id] = urls;
  }

  return { entries, thumbs, objectUrls };
}
