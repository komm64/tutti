import { getSettings } from '../storage';
import { normalizeCaptureText } from '../utils/post-capture-record';

export async function captureMastodonPostViaPublicApi(
  tabId: number,
  text: string,
  expectedUser: string | undefined,
  debug: (message: string) => void,
): Promise<string | undefined> {
  const target = normalizeCaptureText(text).slice(0, 60);
  if (!target) return undefined;

  const identity = await resolveMastodonIdentity(tabId, expectedUser);
  if (!identity.acct) {
    debug('Mastodon public API fallback skipped: account unknown');
    return undefined;
  }

  const accountId = await fetchMastodonAccountId(
    identity.instance,
    identity.acct,
    debug,
  );
  if (!accountId) return undefined;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (attempt > 0) await sleep(1000);
    try {
      const statusesUrl =
        `${identity.instance}/api/v1/accounts/${encodeURIComponent(accountId)}` +
        '/statuses?limit=10&exclude_replies=false&exclude_reblogs=true';
      const response = await fetch(statusesUrl, { cache: 'no-store' });
      debug(`Mastodon public API statuses attempt ${attempt}: ${response.status}`);
      if (!response.ok) continue;
      const statuses = await response.json() as Array<{
        url?: string | null;
        uri?: string;
        content?: string;
      }>;
      for (const status of statuses) {
        const body = normalizeCaptureText(stripHtml(status.content ?? ''));
        debug(`  cmp "${body.slice(0, 30)}" vs "${target.slice(0, 30)}"`);
        if (!body.startsWith(target)) continue;
        const url = status.url || status.uri;
        if (url) {
          debug(`URL captured via Mastodon public API: ${url}`);
          return url;
        }
      }
    } catch (error) {
      debug(
        `Mastodon public API statuses failed: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return undefined;
}

async function resolveMastodonIdentity(
  tabId: number,
  expectedUser: string | undefined,
): Promise<{ instance: string; acct?: string }> {
  let instance = await inferMastodonInstance(tabId);
  const raw = expectedUser?.trim().replace(/^@/, '') ?? '';
  if (!raw) return { instance };

  const federated = raw.match(/^([^@]+)@([^@]+)$/);
  if (federated?.[1] && federated?.[2]) {
    instance = `https://${federated[2]}`;
    return { instance, acct: federated[1] };
  }

  return { instance, acct: raw };
}

async function inferMastodonInstance(tabId: number): Promise<string> {
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab.url) {
      const url = new URL(tab.url);
      if (url.protocol === 'https:') return url.origin;
    }
  } catch { /* fall through to settings */ }

  try {
    return (await getSettings()).mastodonInstance;
  } catch {
    return 'https://mastodon.social';
  }
}

async function fetchMastodonAccountId(
  instance: string,
  acct: string,
  debug: (message: string) => void,
): Promise<string | undefined> {
  try {
    const lookupUrl =
      `${instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`;
    const response = await fetch(lookupUrl, { cache: 'no-store' });
    debug(`Mastodon public API lookup: ${response.status}`);
    if (!response.ok) return undefined;
    const data = await response.json() as { id?: string };
    return data.id;
  } catch (error) {
    debug(
      `Mastodon public API lookup failed: ` +
      `${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
