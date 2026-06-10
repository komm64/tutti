import type { PlatformId } from '../messages';
import { waitForTabComplete } from './tab-management';
import {
  captureRenderedProfilePostUrl,
  isRenderedProfileFallbackPlatform,
} from './post-url-rendered-profile';
import { readFreshCapturedPost } from '../utils/post-capture-record';

export interface CapturePostUrlOptions {
  platform: PlatformId;
  tabId: number;
  text: string;
  expectedUser?: string;
  onDebug?: (message: string) => void;
  frameRetry?: number;
}

const CAPTURE_SUPPORTED_PLATFORMS = new Set<PlatformId>([
  'mastodon',
  'misskey',
  'bluesky',
  'threads',
  'tumblr',
  'x',
  'pixiv',
  'deviantart',
  'instagram',
  'tiktok',
  'youtube',
]);

/**
 * v0.5.8+ post 後の URL を tab 側 API で取得する。
 * navigation や channel-closed で content script の URL 取得が間に合わないケースの補完。
 */
export async function capturePostUrlFromTab(options: CapturePostUrlOptions): Promise<string | undefined> {
  const {
    platform,
    tabId,
    text,
    expectedUser,
    onDebug,
    frameRetry = 0,
  } = options;
  if (!CAPTURE_SUPPORTED_PLATFORMS.has(platform)) return undefined;

  const dbg = (message: string): void => {
    onDebug?.(`[capturePostUrl ${platform}] ${message}`);
  };
  dbg(`start (tabId=${tabId}, text="${text.slice(0, 30)}...")`);

  if (platform === 'threads' && expectedUser) {
    const renderedUrl = await captureRenderedProfilePostUrl(platform, tabId, text, dbg, expectedUser);
    if (renderedUrl) return renderedUrl;
  }

  const storedApiUrl = await captureStoredApiPostUrl(platform, tabId, text, dbg);
  if (storedApiUrl) return storedApiUrl;

  try {
    if (platform === 'tumblr') {
      await sleep(1000);
    }
    if (platform === 'youtube') {
      dbg('reload Studio dashboard before latest Short lookup');
      await browser.tabs.reload(tabId);
      await waitForTabComplete(tabId);
      await sleep(1000);
    }

    const target = text.replace(/\s+/g, ' ').trim().slice(0, 60);
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: async (platformName: string, targetText: string, expectedUserName?: string) => {
        const trace: string[] = [];
        async function tryFetch(): Promise<{ url?: string; trace: string[] }> {
          if (
            platformName === 'deviantart' &&
            /^\/[^/]+\/art\/[^/?#]+/.test(location.pathname)
          ) {
            return { url: location.href, trace };
          }
          if (
            platformName === 'pixiv' &&
            /\/artworks\/\d+/.test(location.pathname)
          ) {
            return { url: location.href, trace };
          }
          if (platformName === 'instagram') {
            trace.push('instagram URL capture requires configure response; DOM first-link fallback disabled');
          }
          if (platformName === 'tiktok') {
            for (let i = 0; i < 20; i += 1) {
              const link = document.querySelector<HTMLAnchorElement>('a[href*="/video/"]');
              if (link && /\/@[^/]+\/video\/\d+/.test(link.href)) return { url: link.href, trace };
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
          if (platformName === 'youtube') {
            for (let i = 0; i < 120; i += 1) {
              const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"]'));
              const body = (document.body?.innerText ?? '').replace(/\s+/g, ' ');
              const id = body.includes(`Latest YouTube Short performance ${targetText}`)
                ? links[0]?.href.match(/\/video\/([\w-]+)/)?.[1]
                : undefined;
              if (id) return { url: `https://www.youtube.com/watch?v=${id}`, trace };
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
          if (platformName === 'x') {
            for (let i = 0; i < 20; i += 1) {
              let captured: { id?: string; capturedAt?: number } | undefined;
              try {
                captured = JSON.parse(localStorage.getItem('tutti:x-latest-post') ?? 'null') as typeof captured;
              } catch { /* ignore */ }
              const fresh = captured?.id && captured.capturedAt && Date.now() - captured.capturedAt < 60_000;
              if (fresh && captured?.id) {
                const avatar = document.querySelector<HTMLElement>(
                  '[data-testid="SideNav_AccountSwitcher_Button"] [data-testid^="UserAvatar-Container-"]',
                );
                const fromAvatar = avatar?.getAttribute('data-testid')?.match(/^UserAvatar-Container-(.+)$/)?.[1];
                const handle = expectedUserName?.replace(/^@/, '') || fromAvatar;
                if (handle) return { url: `https://x.com/${handle}/status/${captured.id}`, trace };
              }
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
          if (platformName === 'mastodon') {
            const initScript = document.querySelector<HTMLScriptElement>('script#initial-state');
            let token: string | undefined;
            let meId: string | undefined;
            try {
              const data = JSON.parse(initScript?.textContent ?? '{}') as {
                meta?: { access_token?: string; me?: string };
              };
              token = data.meta?.access_token;
              meId = data.meta?.me;
            } catch { /* ignore */ }
            trace.push(`initial-state: token=${token ? 'present' : 'missing'}, me=${meId ?? 'missing'}`);
            if (!token || !meId) return { trace };
            for (let i = 0; i < 5; i += 1) {
              if (i > 0) await new Promise((r) => setTimeout(r, 1000));
              trace.push(`attempt ${i}: statuses fetch`);
              const sRes = await fetch(
                `/api/v1/accounts/${meId}/statuses?limit=5&exclude_replies=false&exclude_reblogs=true`,
                { headers: { Authorization: `Bearer ${token}` } },
              );
              trace.push(`  status=${sRes.status}`);
              if (!sRes.ok) continue;
              const statuses = await sRes.json() as Array<{ url?: string; content?: string }>;
              trace.push(`  got ${statuses.length} statuses`);
              for (const s of statuses) {
                const div = document.createElement('div');
                div.innerHTML = s.content ?? '';
                const c = (div.textContent ?? '').replace(/\s+/g, ' ').trim();
                trace.push(`  cmp "${c.slice(0, 30)}" vs "${targetText.slice(0, 30)}"`);
                if (c.startsWith(targetText)) return { url: s.url, trace };
              }
            }
          }
          if (platformName === 'misskey') {
            const raw = localStorage.getItem('account');
            trace.push(`misskey account in localStorage: ${raw ? 'yes' : 'no'}`);
            if (!raw) return { trace };
            let token: string | undefined;
            let userId: string | undefined;
            try {
              const acc = JSON.parse(raw) as { token?: string; i?: string; id?: string };
              token = acc.token ?? acc.i;
              userId = acc.id;
            } catch { /* ignore */ }
            trace.push(`token: ${token ? 'present' : 'missing'}, userId: ${userId ?? 'missing'}`);
            if (!token || !userId) return { trace };
            for (let i = 0; i < 5; i += 1) {
              if (i > 0) await new Promise((r) => setTimeout(r, 1000));
              const res = await fetch('/api/users/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ i: token, userId, limit: 5 }),
              });
              trace.push(`attempt ${i}: notes status=${res.status}`);
              if (!res.ok) continue;
              const notes = await res.json() as Array<{ id?: string; text?: string }>;
              trace.push(`  got ${notes.length} notes`);
              for (const n of notes) {
                const t = (n.text ?? '').replace(/\s+/g, ' ').trim();
                trace.push(`  cmp "${t.slice(0, 30)}" vs "${targetText.slice(0, 30)}"`);
                if (t.startsWith(targetText) && n.id) return { url: `${location.origin}/notes/${n.id}`, trace };
              }
            }
          }
          if (platformName === 'bluesky') {
            const raw = localStorage.getItem('BSKY_STORAGE');
            trace.push(`BSKY_STORAGE: ${raw ? 'present' : 'missing'}`);
            if (!raw) return { trace };
            let session: { accessJwt?: string; did?: string; handle?: string; service?: string } | undefined;
            try {
              const data = JSON.parse(raw) as { session?: { currentAccount?: { accessJwt?: string; did?: string; handle?: string; service?: string } } };
              session = data.session?.currentAccount;
            } catch { /* ignore */ }
            trace.push(`session: jwt=${session?.accessJwt ? 'present' : 'missing'} did=${session?.did} handle=${session?.handle}`);
            if (!session?.accessJwt || !session.did || !session.handle) return { trace };
            const appview = 'https://public.api.bsky.app';
            for (let i = 0; i < 5; i += 1) {
              if (i > 0) await new Promise((r) => setTimeout(r, 1000));
              const res = await fetch(`${appview}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(session.did)}&limit=5`);
              trace.push(`attempt ${i}: feed status=${res.status}`);
              if (!res.ok) continue;
              const data = await res.json() as { feed?: Array<{ post?: { uri?: string; record?: { text?: string } } }> };
              for (const item of data.feed ?? []) {
                const t = (item.post?.record?.text ?? '').replace(/\s+/g, ' ').trim();
                if (t.startsWith(targetText)) {
                  const uri = item.post?.uri;
                  const m = uri?.match(/\/app\.bsky\.feed\.post\/([a-zA-Z0-9]+)$/);
                  if (m) return { url: `https://bsky.app/profile/${session.handle}/post/${m[1]}`, trace };
                }
              }
            }
          }
          return { trace };
        }
        return await tryFetch();
      },
      args: [platform, target, expectedUser],
      world: 'MAIN',
    });

    dbg(`scripting result count=${results?.length}`);
    const r = results?.[0]?.result as { url?: string; trace?: string[] } | null | undefined;
    if (r?.trace) {
      for (const line of r.trace.slice(0, 30)) dbg(`  ${line}`);
    }
    if (typeof r?.url === 'string') {
      dbg(`URL captured: ${r.url}`);
      return r.url;
    }

    if (isRenderedProfileFallbackPlatform(platform)) {
      const renderedUrl = await captureRenderedProfilePostUrl(platform, tabId, text, dbg, expectedUser);
      if (renderedUrl) return renderedUrl;
    }
    dbg('URL not found');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    dbg(`exception: ${message}`);
    if (/Frame with ID/i.test(message) && /was removed/i.test(message) && frameRetry < 2) {
      await sleep(1000);
      dbg(`retry after frame replacement (${frameRetry + 1}/2)`);
      return capturePostUrlFromTab({
        platform,
        tabId,
        text,
        expectedUser,
        onDebug,
        frameRetry: frameRetry + 1,
      });
    }
  }
  return undefined;
}

async function captureStoredApiPostUrl(
  platform: PlatformId,
  tabId: number,
  text: string,
  dbg: (message: string) => void,
): Promise<string | undefined> {
  const key = platform === 'instagram'
    ? 'tutti:ig-latest-post'
    : platform === 'tumblr'
      ? 'tutti:tumblr-latest-post'
      : undefined;
  if (!key) return undefined;

  for (let i = 0; i < 12; i += 1) {
    try {
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: (storageKey: string) => {
          try {
            return localStorage.getItem(storageKey);
          } catch {
            return null;
          }
        },
        args: [key],
        world: 'MAIN',
      });
      const raw = results?.[0]?.result;
      const record = readFreshCapturedPost(typeof raw === 'string' ? raw : null, text, 120_000);
      if (record?.url) {
        dbg(`URL captured via stored API response: ${record.url}`);
        return record.url;
      }
    } catch (e) {
      dbg(`stored API response read failed: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
    await sleep(500);
  }
  dbg('stored API response URL not found');
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
