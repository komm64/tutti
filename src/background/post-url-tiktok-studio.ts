import { waitForWebActionPacing } from '../utils/web-action-pacing';
import { retryTransientTabAction } from './tab-action-retry';
import { closeTabSafely, waitForTabComplete } from './tab-management';

/**
 * TikTok post URL capture through TikTok Studio's post list
 * (tutti-issues#115).
 *
 * After Post, TikTok may stay on the upload page instead of redirecting, so
 * the source tab often has no link to the new video. The Studio post list
 * shows the newest posts first, with the caption as link text. We read it in
 * a separate background tab, so a post TikTok is still finishing in the
 * source tab is never navigated away from.
 *
 * A link is accepted only when its video ID was created after the post
 * started (TikTok IDs carry the creation time in their top 32 bits) and its
 * caption matches. Older posts are never returned as the new one.
 */

export const TIKTOK_STUDIO_CONTENT_URL = 'https://www.tiktok.com/tiktokstudio/content';

const CREATED_AT_TOLERANCE_MS = 5_000;
const CAPTION_MATCH_CHARS = 20;
const SCAN_WINDOW_MS = 20_000;
const SCAN_PASSES = 4;

export interface TikTokStudioLink {
  href: string;
  text: string;
}

export function tiktokVideoCreatedAtMs(videoId: string): number | null {
  if (!/^\d{15,20}$/.test(videoId)) return null;
  try {
    return Number(BigInt(videoId) >> 32n) * 1000;
  } catch {
    return null;
  }
}

function normalizeCaption(value: string): string {
  return value.replace(/[​\s]+/g, ' ').trim();
}

export function pickTikTokStudioVideoUrl(
  links: readonly TikTokStudioLink[],
  text: string,
  minCapturedAt?: number,
): string | undefined {
  const caption = normalizeCaption(text).slice(0, CAPTION_MATCH_CHARS);
  const hasStart = typeof minCapturedAt === 'number' && Number.isFinite(minCapturedAt);
  // Without either signal any link could be an older post.
  if (!caption && !hasStart) return undefined;
  for (const link of links) {
    const id = link.href.match(/\/@[^/?#]+\/video\/(\d+)/)?.[1];
    if (!id) continue;
    if (hasStart) {
      const createdAt = tiktokVideoCreatedAtMs(id);
      if (createdAt === null || createdAt < minCapturedAt - CREATED_AT_TOLERANCE_MS) continue;
    }
    if (caption && !normalizeCaption(link.text).startsWith(caption)) continue;
    return new URL(link.href, 'https://www.tiktok.com').href;
  }
  return undefined;
}

async function readStudioLinks(tabId: number, windowMs: number): Promise<TikTokStudioLink[]> {
  const results = await browser.scripting.executeScript({
    target: { tabId },
    func: async (waitMs: number) => {
      const read = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"]'))
        .map((anchor) => ({ href: anchor.href, text: anchor.textContent ?? '' }));
      const deadline = Date.now() + waitMs;
      let links = read();
      while (links.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        links = read();
      }
      return links;
    },
    args: [windowMs],
    world: 'MAIN',
  });
  const links = results?.[0]?.result;
  return Array.isArray(links) ? links as TikTokStudioLink[] : [];
}

export async function captureTikTokStudioPostUrl(
  sourceTabId: number,
  text: string,
  minCapturedAt: number | undefined,
  dbg: (message: string) => void,
): Promise<string | undefined> {
  try {
    const source = await browser.tabs.get(sourceTabId);
    const sourceUrl = source.url ?? '';
    const direct = sourceUrl.match(/^https:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/\d+/)?.[0];
    if (direct) return direct;
    if (sourceUrl.startsWith(TIKTOK_STUDIO_CONTENT_URL)) {
      const url = pickTikTokStudioVideoUrl(await readStudioLinks(sourceTabId, 5_000), text, minCapturedAt);
      if (url) {
        dbg(`URL captured from the Studio post list in the source tab: ${url}`);
        return url;
      }
    }
  } catch (error) {
    dbg(`source tab check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const tab = await retryTransientTabAction('open TikTok Studio post list', async () => {
    await waitForWebActionPacing('navigation');
    return await browser.tabs.create({ url: TIKTOK_STUDIO_CONTENT_URL, active: false });
  });
  if (typeof tab.id !== 'number') return undefined;
  try {
    for (let pass = 0; pass < SCAN_PASSES; pass += 1) {
      if (pass > 0) {
        // The list does not refresh itself while TikTok processes the video.
        await browser.tabs.reload(tab.id);
      }
      await waitForTabComplete(tab.id);
      const links = await readStudioLinks(tab.id, SCAN_WINDOW_MS);
      const url = pickTikTokStudioVideoUrl(links, text, minCapturedAt);
      dbg(`Studio post list pass ${pass + 1}/${SCAN_PASSES}: links=${links.length} match=${url ? 'yes' : 'no'}`);
      if (url) return url;
      if (pass < SCAN_PASSES - 1) await new Promise((resolve) => setTimeout(resolve, SCAN_WINDOW_MS));
    }
  } catch (error) {
    dbg(`Studio post list failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await closeTabSafely(tab.id);
  }
  return undefined;
}
