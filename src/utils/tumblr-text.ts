import { stripHashtagsFromText } from './hashtags';

export interface TumblrTextValidation {
  ok: boolean;
  error?: string;
}

export interface TumblrTextValidationOptions {
  /**
   * Tumblr can move inline hashtags into the post tags editor after rich-editor
   * remounts. In that state the body should match the caption with hashtags
   * removed, while the caller separately verifies tag commit.
   */
  allowHashtagStripped?: boolean;
  /**
   * Tumblr turns pasted URLs into link preview cards. When that happens, the
   * editable body blocks keep the surrounding text but no longer expose the URL
   * as body text.
   */
  allowUrlStripped?: boolean;
}

export function normalizeTumblrText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function stripUrlsFromText(value: string): string {
  return value
    .replace(/\bhttps?:\/\/\S+/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function countNormalizedOccurrences(haystack: string, needle: string): number {
  const normalizedHaystack = normalizeTumblrText(haystack);
  const normalizedNeedle = normalizeTumblrText(needle);
  if (!normalizedNeedle) return 0;
  let count = 0;
  let index = 0;
  while (index <= normalizedHaystack.length) {
    const found = normalizedHaystack.indexOf(normalizedNeedle, index);
    if (found < 0) break;
    count += 1;
    index = found + normalizedNeedle.length;
  }
  return count;
}

export function validateTumblrBodyText(
  actual: string,
  expected: string,
  options: TumblrTextValidationOptions = {},
): TumblrTextValidation {
  const normalizedActual = normalizeTumblrText(actual);
  const normalizedExpected = normalizeTumblrText(expected);
  if (!normalizedExpected) return { ok: normalizedActual.length === 0 };

  const candidates: Array<{ label: string; text: string; allowEmptyActual: boolean }> = [
    { label: 'same text', text: expected, allowEmptyActual: false },
  ];

  const addCandidate = (label: string, text: string, allowEmptyActual: boolean) => {
    const normalizedText = normalizeTumblrText(text);
    const alreadyAdded = candidates.some((candidate) => normalizeTumblrText(candidate.text) === normalizedText);
    if (!alreadyAdded) candidates.push({ label, text, allowEmptyActual });
  };

  const hashtagStrippedExpected = options.allowHashtagStripped
    ? stripHashtagsFromText(expected)
    : undefined;
  if (hashtagStrippedExpected !== undefined && normalizeTumblrText(hashtagStrippedExpected) !== normalizedExpected) {
    addCandidate('hashtag-stripped text', hashtagStrippedExpected, true);
  }

  if (options.allowUrlStripped) {
    const urlStrippedExpected = stripUrlsFromText(expected);
    if (normalizeTumblrText(urlStrippedExpected) !== normalizedExpected) {
      addCandidate('URL-stripped text', urlStrippedExpected, false);
    }
    if (hashtagStrippedExpected !== undefined) {
      const hashtagAndUrlStrippedExpected = stripUrlsFromText(hashtagStrippedExpected);
      if (normalizeTumblrText(hashtagAndUrlStrippedExpected) !== normalizedExpected) {
        addCandidate('hashtag-and-URL-stripped text', hashtagAndUrlStrippedExpected, false);
      }
    }
  }

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeTumblrText(candidate.text);
    if (!normalizedCandidate) {
      if (candidate.allowEmptyActual && normalizedActual.length === 0) return { ok: true };
      if (candidate.allowEmptyActual && normalizedActual.length > 0) {
        return {
          ok: false,
          error: 'Tumblr body contains unexpected text after hashtags were moved to tags.',
        };
      }
      continue;
    }
    const occurrences = countNormalizedOccurrences(normalizedActual, normalizedCandidate);
    if (occurrences === 1) return { ok: true };
    if (occurrences > 1) {
      return {
        ok: false,
        error: `Tumblr body contains ${occurrences} copies of the ${candidate.label}; refusing to submit a duplicated post.`,
      };
    }
  }

  return {
    ok: false,
    error: 'Tumblr body does not contain the current draft text.',
  };
}
