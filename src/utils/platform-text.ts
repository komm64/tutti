import type { PlatformId } from '../messages';
import { splitText } from './split';

const X_URL_RE = /https?:\/\/[^\s]+/giu;
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const EXTENDED_PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u;
const URL_PLACEHOLDER_START = 0xe000;
const URL_PLACEHOLDER_END = 0xf8ff;
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
  for (const grapheme of GRAPHEME_SEGMENTER.segment(text)) {
    if (EXTENDED_PICTOGRAPHIC_RE.test(grapheme.segment)) {
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
  return Array.from(GRAPHEME_SEGMENTER.segment(text)).length;
}

export function measureTextForPlatform(platform: PlatformId, text: string): number {
  if (platform === 'x') return measureXText(text);
  if (platform === 'bluesky') return measureGraphemes(text);
  return text.length;
}

export function splitTextForPlatform(platform: PlatformId, text: string, limit: number): string[] {
  if (platform === 'x') return splitXText(text, limit);
  return splitText(text, limit, (value) => measureTextForPlatform(platform, value));
}

function splitXText(text: string, limit: number): string[] {
  const replacements: Array<{ placeholder: string; url: string }> = [];
  let nextPlaceholder = URL_PLACEHOLDER_START;
  const compressed = text.replace(X_URL_RE, (url) => {
    while (nextPlaceholder <= URL_PLACEHOLDER_END) {
      const placeholder = String.fromCodePoint(nextPlaceholder++);
      if (text.includes(placeholder)) continue;
      replacements.push({ placeholder, url });
      return placeholder;
    }
    return url;
  });

  if (replacements.length === 0) {
    return splitText(text, limit, measureXText);
  }

  const placeholderWeights = new Map(replacements.map(({ placeholder }) => [placeholder, 23]));
  const chunks = splitText(compressed, limit, (value) => measureCompressedXText(value, placeholderWeights));
  return chunks.map((chunk) => restoreUrlPlaceholders(chunk, replacements));
}

function measureCompressedXText(text: string, placeholderWeights: Map<string, number>): number {
  let total = 0;
  let plain = '';
  for (const grapheme of GRAPHEME_SEGMENTER.segment(text)) {
    const placeholderWeight = placeholderWeights.get(grapheme.segment);
    if (placeholderWeight === undefined) {
      plain += grapheme.segment;
      continue;
    }
    total += measureXText(plain);
    total += placeholderWeight;
    plain = '';
  }
  return total + measureXText(plain);
}

function restoreUrlPlaceholders(
  text: string,
  replacements: Array<{ placeholder: string; url: string }>,
): string {
  let restored = text;
  for (const { placeholder, url } of replacements) {
    restored = restored.replaceAll(placeholder, url);
  }
  return restored;
}
