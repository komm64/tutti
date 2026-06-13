import type { PlatformId } from '../messages';
import { closeTabSafely, waitForTabComplete } from './tab-management';
import { retryTransientTabAction } from './tab-action-retry';

export type RenderedProfilePlatform = 'x' | 'threads' | 'tumblr' | 'pixiv';

export function isRenderedProfileFallbackPlatform(platform: PlatformId): platform is RenderedProfilePlatform {
  return platform === 'x' ||
    platform === 'threads' ||
    platform === 'tumblr' ||
    platform === 'pixiv';
}

export async function captureRenderedProfilePostUrl(
  platform: RenderedProfilePlatform,
  sourceTabId: number,
  text: string,
  dbg: (message: string) => void,
  expectedUser?: string,
): Promise<string | undefined> {
  const expectedThreadsUser = platform === 'threads' ? expectedUser?.replace(/^@/, '') : undefined;
  const expectedXUser = platform === 'x' ? expectedUser?.replace(/^@/, '') : undefined;
  const profileResults = expectedThreadsUser || expectedXUser ? undefined : await browser.scripting.executeScript({
    target: { tabId: sourceTabId },
    func: (platformName: string) => {
      if (platformName === 'threads') {
        const hrefs = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/@"]'))
          .map((anchor) => anchor.getAttribute('href'))
          .filter((href): href is string => !!href && /^\/@[^/?#]+$/.test(href));
        const profileHref = hrefs.find((href) => {
          const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>(`a[href="${href}"]`));
          return anchors.some((anchor) => /profile|プロフィール/i.test(anchor.textContent ?? ''));
        }) ?? hrefs[0];
        return profileHref ? new URL(profileHref, location.origin).href : undefined;
      }
      if (platformName === 'x') {
        const avatar = document.querySelector<HTMLElement>(
          '[data-testid="SideNav_AccountSwitcher_Button"] [data-testid^="UserAvatar-Container-"]',
        );
        const fromAvatar = avatar?.getAttribute('data-testid')?.match(/^UserAvatar-Container-(.+)$/)?.[1];
        if (fromAvatar) return `${location.origin}/${encodeURIComponent(fromAvatar)}`;
        const reserved = new Set(['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'settings', 'search']);
        const rootHref = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'))
          .map((anchor) => anchor.getAttribute('href'))
          .find((href) => {
            const handle = href?.match(/^\/([^/?#]+)$/)?.[1];
            return !!handle && !reserved.has(handle);
          });
        return rootHref ? new URL(rootHref, location.origin).href : undefined;
      }
      if (platformName === 'pixiv') {
        if (/\/users\/\d+/.test(location.pathname)) return location.href;
        const profileHref = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/users/"]'))
          .map((anchor) => anchor.getAttribute('href'))
          .find((href) => !!href && /\/users\/\d+(?:[/?#]|$)/.test(href) && !/\/following|\/followers/.test(href));
        return profileHref ? new URL(profileHref, location.origin).href : undefined;
      }

      const blogButton = Array.from(document.querySelectorAll<HTMLElement>('[aria-label]'))
        .find((el) => /current selection is|現在の選択/i.test(el.getAttribute('aria-label') ?? ''));
      const blogName = blogButton?.textContent?.trim();
      return blogName ? `${location.origin}/blog/${encodeURIComponent(blogName)}` : undefined;
    },
    args: [platform],
    world: 'MAIN',
  });
  const profileUrl = expectedThreadsUser
    ? `https://www.threads.com/@${encodeURIComponent(expectedThreadsUser)}`
    : expectedXUser
      ? `https://x.com/${encodeURIComponent(expectedXUser)}`
      : profileResults?.[0]?.result;
  if (typeof profileUrl !== 'string') {
    dbg('rendered profile URL not detected');
    return undefined;
  }

  dbg(`rendered profile scrape: ${profileUrl}`);
  const tab = await retryTransientTabAction('open rendered profile capture tab', () => (
    browser.tabs.create({ url: profileUrl, active: false })
  ));
  if (typeof tab.id !== 'number') return undefined;
  try {
    await waitForTabComplete(tab.id);
    const target = text.replace(/\s+/g, ' ').trim().slice(0, platform === 'pixiv' ? 30 : 60);
    if (!target) {
      dbg('rendered profile fallback skipped for empty text');
      return undefined;
    }
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (platformName: string, targetText: string) => {
        const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
          const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
            .filter((anchor) => {
              const href = anchor.href;
              return platformName === 'threads'
                ? /\/@[^/]+\/post\/[\w-]+/.test(href)
                : platformName === 'x'
                  ? /\/[^/]+\/status\/\d+/.test(href)
                  : platformName === 'tumblr'
                    ? /tumblr\.com\/(?:[^/]+\/\d+|blog\/[^/]+\/\d+)(?:\/|$)/.test(href)
                    : platformName === 'pixiv'
                      ? /pixiv\.net\/(?:[a-z]+\/)?artworks\/\d+/.test(href)
                      : false;
            });
          for (const link of links) {
            let ancestor: HTMLElement | null = link;
            for (let depth = 0; ancestor && depth < 10; depth += 1, ancestor = ancestor.parentElement) {
              const body = normalize(ancestor.innerText);
              if (platformName === 'tumblr') {
                if (body.length > 4000) continue;
                if (/pinned post|固定された投稿/i.test(body)) continue;
                const postLinkCount = Array.from(ancestor.querySelectorAll<HTMLAnchorElement>('a[href]'))
                  .filter((anchor) => /tumblr\.com\/(?:[^/]+\/\d+|blog\/[^/]+\/\d+)(?:\/|$)/.test(anchor.href))
                  .length;
                if (postLinkCount > 3) continue;
              }
              if (body.includes(targetText)) return link.href;
            }
          }
          if (platformName === 'threads' && normalize(document.body.innerText).includes(targetText)) {
            return links[0]?.href;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return undefined;
      },
      args: [platform, target],
      world: 'MAIN',
    });
    const url = results?.[0]?.result;
    if (typeof url === 'string') {
      dbg(`URL captured via rendered profile: ${url}`);
      return url;
    }
    dbg('rendered profile did not contain matching post');
  } finally {
    await closeTabSafely(tab.id);
  }
  return undefined;
}
