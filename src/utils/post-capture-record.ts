export interface CapturedPostRecord {
  url?: string;
  code?: string;
  id?: string;
  blogName?: string;
  username?: string;
  capturedAt: number;
  textHash?: string;
}

export interface InstagramConfigureBodyResult {
  body: string;
  changed: boolean;
  textHash?: string;
}

const INSTAGRAM_CONFIGURE_RE = /\/api\/v1\/media\/(?:configure|configure_sidecar|configure_to_clips)\//;
const INSTAGRAM_POST_URL_RE = /^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[\w-]+\/?/;
const INSTAGRAM_CODE_RE = /^[A-Za-z0-9_-]{5,}$/;
const MASTODON_POST_URL_RE = /^https:\/\/[^/]+\/(?:@[^/]+\/\d+|users\/[^/]+\/statuses\/\d+)(?:[/?#]|$)/;
const TUMBLR_POST_URL_RE = /^https:\/\/(?:www\.)?tumblr\.com\/(?:[^/]+\/\d+|blog\/[^/]+\/\d+)(?:[/?#]|$)/;
const THREADS_POST_URL_RE = /^https:\/\/(?:www\.)?threads\.(?:com|net)\/@[^/]+\/post\/[\w-]+(?:[/?#]|$)/;
const THREADS_CODE_RE = /^[A-Za-z0-9_-]{5,}$/;
const THREADS_USERNAME_RE = /^[A-Za-z0-9._]{2,}$/;

export function normalizeCaptureText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function hashCaptureText(value: string): string {
  const normalized = normalizeCaptureText(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function isInstagramConfigureUrl(url: string): boolean {
  return INSTAGRAM_CONFIGURE_RE.test(url);
}

export function prepareInstagramConfigureBody(
  body: string,
  caption: string | undefined,
): InstagramConfigureBodyResult {
  const fallbackCaption = caption ?? '';
  const trimmed = body.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const existing = typeof parsed.caption === 'string' ? parsed.caption : '';
      const nextCaption = existing.trim() ? existing : fallbackCaption;
      if (!nextCaption) return { body, changed: false };
      const changed = parsed.caption !== nextCaption;
      parsed.caption = nextCaption;
      return {
        body: changed ? JSON.stringify(parsed) : body,
        changed,
        textHash: hashCaptureText(nextCaption),
      };
    } catch {
      // Fall through to form-style handling.
    }
  }

  const match = body.match(/(^|&)caption=([^&]*)/);
  if (match?.index !== undefined) {
    const rawValue = match[2] ?? '';
    const existing = decodeFormValue(rawValue);
    const nextCaption = existing.trim() ? existing : fallbackCaption;
    if (!nextCaption) return { body, changed: false };
    if (existing.trim()) {
      return { body, changed: false, textHash: hashCaptureText(existing) };
    }
    const encoded = encodeURIComponent(nextCaption);
    const valueStart = match.index + (match[1]?.length ?? 0) + 'caption='.length;
    const valueEnd = valueStart + rawValue.length;
    return {
      body: body.slice(0, valueStart) + encoded + body.slice(valueEnd),
      changed: true,
      textHash: hashCaptureText(nextCaption),
    };
  }

  if (!fallbackCaption) return { body, changed: false };
  return {
    body: `${body}${body ? '&' : ''}caption=${encodeURIComponent(fallbackCaption)}`,
    changed: true,
    textHash: hashCaptureText(fallbackCaption),
  };
}

export function extractInstagramPostRecord(
  payload: unknown,
  textHash?: string,
  now = Date.now(),
): CapturedPostRecord | undefined {
  let url: string | undefined;
  let code: string | undefined;
  let isReel = false;

  walkObject(payload, (key, value) => {
    if (typeof value !== 'string') return;
    const lowerKey = key.toLowerCase();
    const normalizedUrl = normalizeInstagramUrl(value);
    if (!url && normalizedUrl) url = normalizedUrl;
    if (!code && (lowerKey === 'code' || lowerKey === 'shortcode') && INSTAGRAM_CODE_RE.test(value)) {
      code = value;
    }
    if (lowerKey === 'product_type' && /clips|reel/i.test(value)) isReel = true;
  });

  if (!url && code) {
    url = `https://www.instagram.com/${isReel ? 'reel' : 'p'}/${code}/`;
  }
  if (!url && !code) return undefined;
  return { url, code, capturedAt: now, textHash };
}

export function extractMastodonPostRecord(
  payload: unknown,
  textHash?: string,
  now = Date.now(),
): CapturedPostRecord | undefined {
  let url: string | undefined;
  let id: string | undefined;

  walkObject(payload, (key, value) => {
    const lowerKey = key.toLowerCase();
    if (typeof value === 'string') {
      const normalizedUrl = normalizeMastodonUrl(value);
      if (!url && normalizedUrl) url = normalizedUrl;
      if (!id && lowerKey === 'id' && /^\d+$/.test(value)) id = value;
      const idFromUrl = normalizedUrl?.match(/\/(?:statuses\/)?(\d+)(?:[/?#]|$)/)?.[1];
      if (!id && idFromUrl) id = idFromUrl;
    }
  });

  if (!url && !id) return undefined;
  return { url, id, capturedAt: now, textHash };
}

export function extractTumblrPostRecord(
  payload: unknown,
  fallbackBlogName?: string,
  textHash?: string,
  now = Date.now(),
): CapturedPostRecord | undefined {
  let url: string | undefined;
  let id: string | undefined;
  let blogName = fallbackBlogName ? cleanTumblrBlogName(fallbackBlogName) : undefined;

  walkObject(payload, (key, value) => {
    const lowerKey = key.toLowerCase();
    if (typeof value === 'string') {
      const normalizedUrl = normalizeTumblrUrl(value);
      if (!url && normalizedUrl) url = normalizedUrl;
      if (!id && isTumblrPostIdKey(lowerKey) && /^\d+$/.test(value)) id = value;
      if (!blogName && isTumblrBlogNameKey(lowerKey) && /^[\w-]+$/.test(value)) {
        blogName = cleanTumblrBlogName(value);
      }
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      if (!id && isTumblrPostIdKey(lowerKey)) id = String(Math.trunc(value));
    }
  });

  if (!url && blogName && id) {
    url = `https://www.tumblr.com/${blogName}/${id}`;
  }
  if (!url && !id) return undefined;
  return { url, id, blogName, capturedAt: now, textHash };
}

export function extractThreadsPostRecord(
  payload: unknown,
  fallbackUsername?: string,
  textHash?: string,
  now = Date.now(),
): CapturedPostRecord | undefined {
  let url: string | undefined;
  let code: string | undefined;
  let username: string | undefined;
  let usernameFromPayload = false;

  walkObject(payload, (key, value) => {
    const lowerKey = key.toLowerCase();
    if (typeof value !== 'string') return;

    const normalizedUrl = normalizeThreadsUrl(value);
    if (!url && normalizedUrl) {
      url = normalizedUrl;
      const parsed = parseThreadsPostUrl(normalizedUrl);
      if (!code && parsed?.code) code = parsed.code;
      if (!username && parsed?.username) {
        username = parsed.username;
        usernameFromPayload = true;
      }
    }

    if (!code && isThreadsCodeKey(lowerKey) && isLikelyThreadsPostCode(value)) {
      code = value;
    }
    if (!username && isThreadsUsernameKey(lowerKey) && THREADS_USERNAME_RE.test(value)) {
      username = cleanThreadsUsername(value);
      usernameFromPayload = true;
    }
  });

  if (!url && usernameFromPayload && username && code) {
    url = `https://www.threads.com/@${username}/post/${code}`;
  }
  if (!url && !code) return undefined;
  if (!url && code) return undefined;
  return { url, code, username: username ?? (fallbackUsername ? cleanThreadsUsername(fallbackUsername) : undefined), capturedAt: now, textHash };
}

export function readFreshCapturedPost(
  raw: string | null,
  expectedText: string,
  maxAgeMs: number,
  now = Date.now(),
): CapturedPostRecord | undefined {
  if (!raw) return undefined;
  try {
    const record = JSON.parse(raw) as CapturedPostRecord;
    if (!record || typeof record.capturedAt !== 'number') return undefined;
    if (now - record.capturedAt > maxAgeMs) return undefined;
    const expectedHash = expectedText ? hashCaptureText(expectedText) : undefined;
    if (expectedHash && record.textHash && record.textHash !== expectedHash) return undefined;
    return record;
  } catch {
    return undefined;
  }
}

export function findTumblrPostUrlInDocument(
  doc: Document,
  blogName: string,
  text: string,
  origin: string,
): string | undefined {
  const cleanBlog = cleanTumblrBlogName(blogName);
  const target = normalizeCaptureText(text).slice(0, 60);
  if (!target) return undefined;
  const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .filter((link) => isTumblrPostHref(link.getAttribute('href') ?? '', cleanBlog));
  const seen = new Set<string>();
  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    const normalized = new URL(href, origin).href;
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const container = findNarrowPostContainer(link, cleanBlog, target);
    if (!container) continue;
    const body = normalizeCaptureText(container.textContent ?? '');
    if (body.includes(target)) return normalized;
  }
  return undefined;
}

export function findLatestTumblrPostUrlInDocument(
  doc: Document,
  blogName: string,
  origin: string,
  excludeUrls: readonly string[] = [],
): string | undefined {
  const cleanBlog = cleanTumblrBlogName(blogName);
  const excluded = new Set(excludeUrls.map((url) => normalizeTumblrComparableUrl(url)).filter(Boolean));
  const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .filter((link) => isTumblrPostHref(link.getAttribute('href') ?? '', cleanBlog));
  const seen = new Set<string>();
  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    const normalized = normalizeTumblrPostHref(href, origin);
    if (!normalized || seen.has(normalized) || excluded.has(normalizeTumblrComparableUrl(normalized))) continue;
    seen.add(normalized);
    if (!findLikelyTumblrPostContainer(link, cleanBlog)) continue;
    return normalized;
  }
  return undefined;
}

function findNarrowPostContainer(
  link: HTMLAnchorElement,
  blogName: string,
  targetText: string,
): HTMLElement | null {
  let ancestor: HTMLElement | null = link;
  for (let depth = 0; ancestor && depth < 8; depth += 1, ancestor = ancestor.parentElement) {
    const text = normalizeCaptureText(ancestor.textContent ?? '');
    if (!text || text.length > 4000) continue;
    if (!text.includes(targetText)) continue;
    if (/pinned post|固定された投稿/i.test(text)) continue;
    const postLinkCount = Array.from(ancestor.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .filter((a) => isTumblrPostHref(a.getAttribute('href') ?? '', blogName)).length;
    if (postLinkCount > 3) continue;
    return ancestor;
  }
  return null;
}

function findLikelyTumblrPostContainer(
  link: HTMLAnchorElement,
  blogName: string,
): HTMLElement | null {
  const article = link.closest<HTMLElement>('article, [role="article"]');
  if (article) return isLikelyTumblrPostContainer(article, blogName) ? article : null;

  let ancestor: HTMLElement | null = link.parentElement;
  for (let depth = 0; ancestor && depth < 8; depth += 1, ancestor = ancestor.parentElement) {
    if (isLikelyTumblrPostContainer(ancestor, blogName)) return ancestor;
  }
  return null;
}

function isLikelyTumblrPostContainer(container: HTMLElement, blogName: string): boolean {
  const text = normalizeCaptureText(container.textContent ?? '');
  if (text.length > 4000) return false;
  if (/pinned post|固定された投稿/i.test(text)) return false;
  const postLinkCount = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .filter((a) => isTumblrPostHref(a.getAttribute('href') ?? '', blogName)).length;
  return postLinkCount > 0 && postLinkCount <= 3;
}

function isTumblrPostHref(href: string, blogName: string): boolean {
  const escaped = escapeRegExp(blogName);
  return new RegExp(
    `^(?:(?:https://(?:www\\.)?tumblr\\.com)?/(?:${escaped}|blog/${escaped})/\\d+|https://${escaped}\\.tumblr\\.com/post/\\d+)(?:[/?#]|$)`,
    'i',
  ).test(href);
}

function normalizeInstagramUrl(value: string): string | undefined {
  try {
    const url = new URL(value, 'https://www.instagram.com');
    if (!INSTAGRAM_POST_URL_RE.test(url.href)) return undefined;
    url.search = '';
    url.hash = '';
    return url.href.endsWith('/') ? url.href : `${url.href}/`;
  } catch {
    return undefined;
  }
}

function normalizeMastodonUrl(value: string): string | undefined {
  try {
    const url = new URL(value, 'https://mastodon.social');
    if (!MASTODON_POST_URL_RE.test(url.href)) return undefined;
    url.search = '';
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function normalizeTumblrUrl(value: string): string | undefined {
  try {
    const url = new URL(value, 'https://www.tumblr.com');
    const subdomain = url.hostname.match(/^([^.]+)\.tumblr\.com$/i);
    const subdomainPost = url.pathname.match(/^\/post\/(\d+)(?:[/?#]|$)/);
    if (subdomain?.[1] && subdomainPost?.[1]) {
      return `https://www.tumblr.com/${subdomain[1]}/${subdomainPost[1]}`;
    }
    if (!TUMBLR_POST_URL_RE.test(url.href)) return undefined;
    url.search = '';
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function normalizeTumblrPostHref(href: string, origin: string): string | undefined {
  try {
    const url = new URL(href, origin);
    return normalizeTumblrUrl(url.href);
  } catch {
    return undefined;
  }
}

function normalizeTumblrComparableUrl(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/[?#].*$/, '').replace(/\/$/, '');
}

function normalizeThreadsUrl(value: string): string | undefined {
  try {
    const url = new URL(value, 'https://www.threads.com');
    if (!THREADS_POST_URL_RE.test(url.href)) return undefined;
    const match = url.href.match(/^https:\/\/(?:www\.)?threads\.(?:com|net)\/@([^/]+)\/post\/([\w-]+)(?:[/?#]|$)/);
    if (!match?.[1] || !match?.[2]) return undefined;
    return `https://www.threads.com/@${match[1]}/post/${match[2]}`;
  } catch {
    return undefined;
  }
}

function parseThreadsPostUrl(value: string): { username: string; code: string } | undefined {
  const m = value.match(/^https:\/\/(?:www\.)?threads\.(?:com|net)\/@([^/]+)\/post\/([\w-]+)/);
  if (!m?.[1] || !m?.[2]) return undefined;
  return { username: cleanThreadsUsername(m[1]), code: m[2] };
}

function cleanTumblrBlogName(value: string): string {
  return value.replace(/^@/, '').replace(/\.tumblr\.com$/i, '');
}

function cleanThreadsUsername(value: string): string {
  return value.replace(/^@/, '').trim();
}

function isTumblrPostIdKey(lowerKey: string): boolean {
  return lowerKey === 'id' ||
    lowerKey === 'id_string' ||
    lowerKey === 'postid' ||
    lowerKey === 'post_id' ||
    lowerKey === 'post_id_string';
}

function isTumblrBlogNameKey(lowerKey: string): boolean {
  return lowerKey === 'name' ||
    lowerKey === 'blog_name' ||
    lowerKey === 'blogname';
}

function isThreadsCodeKey(lowerKey: string): boolean {
  return lowerKey === 'code' ||
    lowerKey === 'shortcode' ||
    lowerKey === 'url_code' ||
    lowerKey === 'post_code' ||
    lowerKey === 'media_code';
}

function isLikelyThreadsPostCode(value: string): boolean {
  if (!THREADS_CODE_RE.test(value)) return false;
  if (value.length < 8 || value.length > 64) return false;
  if (/^(?:SUCCESS|OK|ERROR|FAIL|FAILED|PENDING|QUEUED)$/i.test(value)) return false;
  return /[a-z0-9_-]/.test(value);
}

function isThreadsUsernameKey(lowerKey: string): boolean {
  return lowerKey === 'username' ||
    lowerKey === 'user_name' ||
    lowerKey === 'owner_username' ||
    lowerKey === 'profile_username';
}

function decodeFormValue(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function walkObject(
  value: unknown,
  visit: (key: string, value: unknown) => void,
  key = '',
  depth = 0,
  seen = new Set<unknown>(),
): void {
  if (depth > 10 || value == null) return;
  visit(key, value);
  if (typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((child, index) => walkObject(child, visit, String(index), depth + 1, seen));
    return;
  }
  for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
    walkObject(child, visit, childKey, depth + 1, seen);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
