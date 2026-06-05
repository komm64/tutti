import type { PlatformId } from '../messages';
import { splitText } from './split';

const X_URL_RE = /https?:\/\/[^\s]+/giu;
const X_SINGLE_WEIGHT_RANGES: Array<[number, number]> = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];

function isXSingleWeight(codePoint: number): boolean {
  return X_SINGLE_WEIGHT_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
}

/**
 * X uses the twitter-text v3 weighted-length rules:
 * - Latin and selected punctuation ranges count as 1
 * - CJK, Hangul, full-width characters, and emoji count as 2
 * - URLs count as the fixed transformed length of 23
 *
 * Keep this dependency-free. The official twitter-text npm package bundles
 * legacy core-js code that uses Function(), which is unsuitable for an MV3
 * extension service worker.
 */
export function measureXText(text: string): number {
  let total = 0;
  let offset = 0;
  for (const match of text.matchAll(X_URL_RE)) {
    const index = match.index ?? 0;
    total += measureXPlainText(text.slice(offset, index));
    total += 23;
    offset = index + match[0].length;
  }
  return total + measureXPlainText(text.slice(offset));
}

function measureXPlainText(text: string): number {
  let total = 0;
  for (const grapheme of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    if (/\p{Extended_Pictographic}/u.test(grapheme.segment)) {
      total += 2;
      continue;
    }
    for (const codePoint of grapheme.segment) {
      total += isXSingleWeight(codePoint.codePointAt(0)!) ? 1 : 2;
    }
  }
  return total;
}

function measureGraphemes(text: string): number {
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).length;
}

export function measureTextForPlatform(platform: PlatformId, text: string): number {
  if (platform === 'x') return measureXText(text);
  if (platform === 'bluesky') return measureGraphemes(text);
  return text.length;
}

export function splitTextForPlatform(platform: PlatformId, text: string, limit: number): string[] {
  return splitText(text, limit, (value) => measureTextForPlatform(platform, value));
}
