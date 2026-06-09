import { describe, expect, it } from 'vitest';
import {
  countNormalizedOccurrences,
  normalizeTumblrText,
  validateTumblrBodyText,
} from './tumblr-text';

describe('Tumblr body text validation', () => {
  it('normalizes whitespace before comparing', () => {
    expect(normalizeTumblrText(' hello\n\nworld\t')).toBe('hello world');
    expect(validateTumblrBodyText('hello\nworld', 'hello world')).toEqual({ ok: true });
  });

  it('rejects duplicated full post text', () => {
    const text = 'Tutti is now in beta';
    expect(countNormalizedOccurrences(`${text}\n\n${text}`, text)).toBe(2);
    expect(validateTumblrBodyText(`${text}\n\n${text}`, text)).toMatchObject({
      ok: false,
    });
  });

  it('allows extra rich-editor text when the current draft appears once', () => {
    expect(validateTumblrBodyText(
      'old Tutti announcement current draft',
      'current draft',
    )).toEqual({ ok: true });
  });

  it('rejects content that does not include the current draft', () => {
    expect(validateTumblrBodyText(
      'old Tutti announcement',
      'current draft',
    )).toMatchObject({ ok: false });
  });
});
