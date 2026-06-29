const HTTP_URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

export function extractHttpUrls(value: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const match of value.matchAll(HTTP_URL_RE)) {
    const url = trimUrlPunctuation(match[0] ?? '');
    if (!url) continue;
    const key = normalizeComparableUrl(url);
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
  }
  return urls;
}

export function normalizeComparableUrl(value: string): string {
  const trimmed = trimUrlPunctuation(value);
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.host.toLowerCase();
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${protocol}//${host}${pathname}${parsed.search}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
}

export function hasUrlEvidence(
  expectedUrl: string,
  found: { text?: string; urls?: readonly string[] },
): boolean {
  const expected = trimUrlPunctuation(expectedUrl);
  if (!expected) return true;
  const expectedComparable = normalizeComparableUrl(expected);
  const expectedWithoutProtocol = expectedComparable.replace(/^https?:\/\//, '');
  const expectedHost = urlHost(expected);
  const expectedPath = urlPath(expected);
  const text = (found.text ?? '').toLowerCase();
  if (text.includes(expected.toLowerCase())) return true;
  if (text.includes(expectedWithoutProtocol)) return true;

  const evidenceUrls = [
    ...extractHttpUrls(found.text ?? ''),
    ...(found.urls ?? []),
  ];
  for (const evidence of evidenceUrls) {
    const evidenceComparable = normalizeComparableUrl(evidence);
    if (evidenceComparable === expectedComparable) return true;
    const evidenceHost = urlHost(evidence);
    if (expectedHost && evidenceHost === expectedHost) {
      if (!expectedPath || expectedPath === '/' || urlPath(evidence).startsWith(expectedPath)) return true;
    }
  }
  return false;
}

export function mergeStandaloneUrlParagraphs(value: string): string {
  const paragraphs = value
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  const merged: string[] = [];
  const pendingUrlParagraphs: string[] = [];

  for (const paragraph of paragraphs) {
    if (isStandaloneUrlParagraph(paragraph)) {
      const urls = extractHttpUrls(paragraph).join(' ');
      if (merged.length > 0) {
        merged[merged.length - 1] = `${merged[merged.length - 1]} ${urls}`.trim();
      } else {
        pendingUrlParagraphs.push(urls);
      }
      continue;
    }
    const prefix = pendingUrlParagraphs.length > 0 ? `${pendingUrlParagraphs.join(' ')} ` : '';
    pendingUrlParagraphs.length = 0;
    merged.push(`${prefix}${paragraph}`);
  }

  if (pendingUrlParagraphs.length > 0) {
    merged.push(pendingUrlParagraphs.join(' '));
  }
  return merged.join('\n\n');
}

function isStandaloneUrlParagraph(value: string): boolean {
  const urls = extractHttpUrls(value);
  if (urls.length === 0) return false;
  const withoutUrls = value.replace(HTTP_URL_RE, '').replace(/\s+/g, '');
  return withoutUrls.length === 0;
}

function trimUrlPunctuation(value: string): string {
  return value.trim().replace(/[),.;!?]+$/g, '');
}

function urlHost(value: string): string | undefined {
  try {
    return new URL(trimUrlUrlProtocol(value)).host.toLowerCase();
  } catch {
    return undefined;
  }
}

function urlPath(value: string): string {
  try {
    return new URL(trimUrlUrlProtocol(value)).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '';
  }
}

function trimUrlUrlProtocol(value: string): string {
  const trimmed = trimUrlPunctuation(value);
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
