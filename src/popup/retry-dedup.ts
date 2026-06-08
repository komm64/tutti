import type { PlatformId } from '../messages';
import type { ImagePreview, VideoPreview } from './types';

export async function filterRecentPlatforms(
  candidates: PlatformId[],
  input: {
    text: string;
    images: readonly ImagePreview[];
    video: VideoPreview | null;
    matches: (result: { success: boolean; uncertain?: boolean }) => boolean;
  },
): Promise<PlatformId[]> {
  try {
    const { getPostHistory } = await import('../storage');
    const { computeBodyHash, sha256Hex } = await import('../utils/body-hash');
    const history = await getPostHistory();
    const mediaDigests: string[] = [];
    for (const media of input.video ? [input.video] : input.images) {
      const bin = atob(media.data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      mediaDigests.push(await sha256Hex(bytes));
    }
    const currentHash = await computeBodyHash(input.text, mediaDigests);
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    const safe: PlatformId[] = [];
    for (const p of candidates) {
      const landed = history.some((e) => {
        if (!e.timestamp || e.timestamp < tenMinAgo) return false;
        if (e.bodyHash !== currentHash) return false;
        const r = e.results?.[p];
        return !!r && input.matches(r);
      });
      if (!landed) safe.push(p);
    }
    return safe;
  } catch {
    // 検出失敗時は安全側に倒さず、既存挙動 (= 全 candidates retry) で続行。
    return candidates;
  }
}
