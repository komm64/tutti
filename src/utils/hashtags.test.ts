import { describe, expect, it } from 'vitest';
import { extractHashtags, stripHashtagsFromText } from './hashtags';

const O = { maxCount: 10, maxLen: 30 } as const;

describe('extractHashtags', () => {
  it('returns empty when text has no hashtags', () => {
    expect(extractHashtags('hello world', O)).toEqual([]);
  });

  it('returns defaultIfEmpty fallback when text has no hashtags', () => {
    expect(extractHashtags('hello', { ...O, defaultIfEmpty: ['tutti'] })).toEqual(['tutti']);
  });

  it('extracts simple hashtags', () => {
    expect(extractHashtags('text with #foo and #bar', O)).toEqual(['foo', 'bar']);
  });

  it('dedupes case-insensitive', () => {
    expect(extractHashtags('#Foo #foo #FOO #bar', O)).toEqual(['Foo', 'bar']);
  });

  it('caps at maxCount', () => {
    const t = '#a #b #c #d #e #f #g #h #i #j #k #l';
    expect(extractHashtags(t, { maxCount: 5, maxLen: 30 })).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('truncates tags to maxLen', () => {
    const long = 'a'.repeat(50);
    expect(extractHashtags(`#${long}`, { maxCount: 10, maxLen: 20 })).toEqual(['a'.repeat(20)]);
  });

  it('supports unicode (Japanese)', () => {
    expect(extractHashtags('絵 #イラスト #風景', O)).toEqual(['イラスト', '風景']);
  });

  it('does not pick up bare # without text', () => {
    expect(extractHashtags('# # hello', O)).toEqual([]);
  });

  it('ignores email-like patterns', () => {
    expect(extractHashtags('contact@example.com nothing else', O)).toEqual([]);
  });
});

describe('stripHashtagsFromText', () => {
  it('removes inline hashtags and tidies whitespace', () => {
    expect(stripHashtagsFromText('hello #foo world #bar baz')).toBe('hello world baz');
  });

  it('preserves text without hashtags', () => {
    expect(stripHashtagsFromText('hello world')).toBe('hello world');
  });

  it('collapses excess newlines', () => {
    expect(stripHashtagsFromText('line1 #t1\n\n\n\nline2 #t2')).toBe('line1\n\nline2');
  });
});
