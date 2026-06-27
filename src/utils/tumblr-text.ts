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
}

export function normalizeTumblrText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
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
  const occurrences = countNormalizedOccurrences(normalizedActual, normalizedExpected);
  if (occurrences === 1) return { ok: true };

  if (options.allowHashtagStripped) {
    const normalizedStrippedExpected = normalizeTumblrText(stripHashtagsFromText(expected));
    const hashtagsWereStripped = normalizedStrippedExpected !== normalizedExpected;
    if (hashtagsWereStripped) {
      if (!normalizedStrippedExpected) {
        return normalizedActual.length === 0
          ? { ok: true }
          : {
              ok: false,
              error: 'Tumblr body contains unexpected text after hashtags were moved to tags.',
            };
      }
      const strippedOccurrences = countNormalizedOccurrences(normalizedActual, normalizedStrippedExpected);
      if (strippedOccurrences === 1) return { ok: true };
      if (strippedOccurrences > 1) {
        return {
          ok: false,
          error: `Tumblr body contains ${strippedOccurrences} copies of the hashtag-stripped text; refusing to submit a duplicated post.`,
        };
      }
    }
  }

  if (occurrences === 0) {
    return {
      ok: false,
      error: 'Tumblr body does not contain the current draft text.',
    };
  }
  return {
    ok: false,
    error: `Tumblr body contains ${occurrences} copies of the same text; refusing to submit a duplicated post.`,
  };
}
