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

  it('keeps hashtag-only drafts strict by default', () => {
    expect(validateTumblrBodyText('', '#tutti #test1')).toMatchObject({ ok: false });
  });

  it('allows hashtag-only drafts after Tumblr moves hashtags to tags', () => {
    expect(validateTumblrBodyText('', '#tutti #test1', {
      allowHashtagStripped: true,
    })).toEqual({ ok: true });
  });

  it('allows body text after Tumblr moves trailing hashtags to tags', () => {
    expect(validateTumblrBodyText('hello world', 'hello world #tutti', {
      allowHashtagStripped: true,
    })).toEqual({ ok: true });
  });

  it('rejects unexpected body text for hashtag-only drafts', () => {
    expect(validateTumblrBodyText('old caption', '#tutti #test1', {
      allowHashtagStripped: true,
    })).toMatchObject({ ok: false });
  });

  it('rejects duplicated hashtag-stripped body text', () => {
    expect(validateTumblrBodyText('hello world\n\nhello world', 'hello world #tutti', {
      allowHashtagStripped: true,
    })).toMatchObject({ ok: false });
  });

  it('rejects body text when Tumblr removes a trailing URL', () => {
    expect(validateTumblrBodyText(
      'Tutti has been updated with several posting fixes. Try it here:',
      'Tutti has been updated with several posting fixes. Try it here:\n\nhttps://tutti.komm64.com/',
    )).toMatchObject({ ok: false });
  });

  it('rejects body text when Tumblr moves hashtags and removes URLs', () => {
    expect(validateTumblrBodyText(
      'hello world',
      'hello world #tutti https://tutti.komm64.com/',
      {
        allowHashtagStripped: true,
      },
    )).toMatchObject({ ok: false });
  });

  it('keeps URL-only drafts strict', () => {
    expect(validateTumblrBodyText('', 'https://tutti.komm64.com/')).toMatchObject({ ok: false });
  });
});
