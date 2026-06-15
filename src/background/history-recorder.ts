import type { ImageAttachment, PlatformId, PostResultMessage } from '../messages';
import { addToPostHistory } from '../storage';
import { releaseAttachmentTransfers, resolveAttachmentToBytes } from '../utils/attachment';
import { computeBodyHash, sha256Hex } from '../utils/body-hash';
import { compressImageForHistory, putMedia } from '../utils/history-media';
import { extractPostId } from '../utils/post-id';
import { postedResults, realPostResults } from './post-result-policy';

export async function recordHistoryEntry(
  text: string,
  results: PostResultMessage[],
  adjustedImages?: ImageAttachment[],
): Promise<void> {
  try {
    const resultsToRecord = realPostResults(results);
    if (resultsToRecord.length === 0) return;

    const hasMedia = (adjustedImages?.length ?? 0) > 0;
    const mediaDigests = await computeMediaDigests(adjustedImages);
    const bodyHash = await computeBodyHash(text, mediaDigests);
    const postIds = buildPostIds(resultsToRecord);

    // 媒体実体を IndexedDB に保存。
    // 保存 ID は `${entryId}-${index}` 形式 (entryId は addToPostHistory が決める)。
    // ここでは「保存するつもりの index 列」 を準備して、 entryId が確定したら参照を作る。
    const entryId = await addToPostHistory(text, resultsToRecord, hasMedia, {
      bodyHash,
      postIds,
      mediaRefs: adjustedImages && adjustedImages.length > 0
        ? adjustedImages.map((_, i) => `pending-${i}`) // 後で書き換える placeholder
        : undefined,
    });

    if (adjustedImages && adjustedImages.length > 0) {
      const mediaIds = await saveHistoryMedia(entryId, adjustedImages);
      // 実際に保存できた id 列で entry を update (placeholder からの差し替え)。
      // 全件失敗時も placeholder を消し、存在しない媒体を履歴 UI が探し続けないようにする。
      await updateHistoryMediaRefs(entryId, mediaIds);
    }
  } catch {
    // 履歴記録は best-effort。 失敗しても表に出さない (= 投稿は既に成功)
  }
}

export function releasePostAttachments(
  originalImages: ImageAttachment[] | undefined,
  adjustedImages: ImageAttachment[] | undefined,
): void {
  void releaseAttachmentTransfers(adjustedImages);
  if (adjustedImages !== originalImages) void releaseAttachmentTransfers(originalImages);
}

export function buildPostIds(results: readonly PostResultMessage[]): Partial<Record<PlatformId, string>> {
  const postIds: Partial<Record<PlatformId, string>> = {};
  for (const r of postedResults(results)) {
    const pid = extractPostId(r.platform, r.url);
    if (pid) postIds[r.platform] = pid;
  }
  return postIds;
}

async function computeMediaDigests(images?: ImageAttachment[]): Promise<string[]> {
  if (!images || images.length === 0) return [];
  const bytesList = await Promise.all(
    images.map((img) => resolveAttachmentToBytes(img).catch(() => null)),
  );
  const mediaDigests: string[] = [];
  for (const bytes of bytesList) {
    if (bytes) mediaDigests.push(await sha256Hex(bytes));
  }
  return mediaDigests;
}

async function saveHistoryMedia(entryId: string, images: ImageAttachment[]): Promise<string[]> {
  const mediaIds: string[] = [];
  for (let i = 0; i < images.length; i += 1) {
    const img = images[i];
    if (!img) continue;
    try {
      const bytes = await resolveAttachmentToBytes(img);
      // Uint8Array → BlobPart: TS の SharedArrayBuffer 型差異を避けて buffer をコピー
      const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
        type: img.type || 'application/octet-stream',
      });
      const id = `${entryId}-${i}`;
      await putMedia(id, await compressImageForHistory(blob));
      mediaIds.push(id);
    } catch {
      // 個別 attach の保存失敗は無視 (history 自体は既に保存済)
    }
  }
  return mediaIds;
}

/** v0.5.5: 履歴 entry の mediaRefs だけを後から書き換える (IndexedDB 保存完了後)。 */
async function updateHistoryMediaRefs(entryId: string, mediaIds: string[]): Promise<void> {
  const stored = await browser.storage.local.get('postHistory');
  const arr = (stored['postHistory'] as Array<{ id: string; mediaRefs?: string[] }> | undefined) ?? [];
  const updated = arr.map((e) => (
    e.id === entryId
      ? { ...e, mediaRefs: mediaIds.length > 0 ? mediaIds : undefined }
      : e
  ));
  await browser.storage.local.set({ postHistory: updated });
}
