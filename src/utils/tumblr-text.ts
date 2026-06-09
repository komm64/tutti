export interface TumblrTextValidation {
  ok: boolean;
  error?: string;
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

export function validateTumblrBodyText(actual: string, expected: string): TumblrTextValidation {
  const normalizedActual = normalizeTumblrText(actual);
  const normalizedExpected = normalizeTumblrText(expected);
  if (!normalizedExpected) return { ok: normalizedActual.length === 0 };
  const occurrences = countNormalizedOccurrences(normalizedActual, normalizedExpected);
  if (occurrences === 0) {
    return {
      ok: false,
      error: 'Tumblr body does not contain the current draft text.',
    };
  }
  if (occurrences > 1) {
    return {
      ok: false,
      error: `Tumblr body contains ${occurrences} copies of the same text; refusing to submit a duplicated post.`,
    };
  }
  return { ok: true };
}
