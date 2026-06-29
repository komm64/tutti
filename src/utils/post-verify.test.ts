import { describe, expect, it } from 'vitest';
import { buildVerifyResult, fuzzyContainsText } from './post-verify';

describe('fuzzyContainsText', () => {
  it('matches identical text', () => {
    expect(fuzzyContainsText('Hello world', 'Hello world')).toBe(true);
  });

  it('matches when found wraps expected with extras (hashtag link)', () => {
    expect(fuzzyContainsText('Hello #cats', 'Hello #cats and more')).toBe(true);
  });

  it('matches across whitespace differences', () => {
    expect(fuzzyContainsText('Hello\nworld', 'Hello world')).toBe(true);
  });

  it('matches Japanese', () => {
    expect(fuzzyContainsText('今日は晴れです', '今日は晴れです #weather')).toBe(true);
  });

  it('returns false on fully missing text', () => {
    expect(fuzzyContainsText('Tutti caption test', '')).toBe(false);
    expect(fuzzyContainsText('Live show last night was amazing #music 2026-05', '')).toBe(false);
  });

  it('skips check for very short expected (< 4 chars meaningful)', () => {
    expect(fuzzyContainsText('Hi', '')).toBe(true);
  });

  it('matches when prefix matches even if URL part differs', () => {
    // "Check this out" prefix 残ってれば後ろの URL は無視
    expect(fuzzyContainsText('Check this out https://example.com/x', 'Check this out')).toBe(true);
  });
});

describe('buildVerifyResult', () => {
  it('returns no issues when text + image + tags all match', () => {
    const r = buildVerifyResult(
      { text: 'Hello world', hasImages: true, expectedTags: ['cats', 'photography'] },
      { text: 'Hello world', hasImages: true, tags: ['cats', 'photography'] },
    );
    expect(r.verified).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('reports caption-missing as error when text totally absent', () => {
    const r = buildVerifyResult(
      { text: 'Hello world', hasImages: false },
      { text: '', hasImages: false },
    );
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]?.kind).toBe('caption-missing');
    expect(r.issues[0]?.severity).toBe('error');
  });

  it('reports image-missing when expected image but found none', () => {
    const r = buildVerifyResult(
      { text: 'Hello', hasImages: true },
      { text: 'Hello', hasImages: false },
    );
    expect(r.issues.some((i) => i.kind === 'image-missing' && i.severity === 'error')).toBe(true);
  });

  it('reports video-missing when expected video but found none', () => {
    const r = buildVerifyResult(
      { text: 'Hello', hasImages: false, hasVideo: true },
      { text: 'Hello', hasImages: false, hasVideo: false },
    );
    expect(r.issues.some((i) => i.kind === 'video-missing' && i.severity === 'error')).toBe(true);
  });

  it('reports tags-missing as warning for partial', () => {
    const r = buildVerifyResult(
      { text: 'Hello', hasImages: false, expectedTags: ['cats', 'dogs', 'birds'] },
      { text: 'Hello', hasImages: false, tags: ['cats'] },
    );
    expect(r.issues.some((i) => i.kind === 'tags-missing' && i.severity === 'warn')).toBe(true);
  });

  it('tag match is case-insensitive', () => {
    const r = buildVerifyResult(
      { text: 'Hi', hasImages: false, expectedTags: ['Cats'] },
      { text: 'Hi', hasImages: false, tags: ['cats'] },
    );
    expect(r.issues).toEqual([]);
  });

  it('reports missing expected URL as a hard error', () => {
    const r = buildVerifyResult(
      { text: 'Try Tutti https://tutti.komm64.com/', hasImages: false, expectedUrls: ['https://tutti.komm64.com/'] },
      { text: 'Try Tutti', hasImages: false },
    );
    expect(r.issues.some((i) => i.kind === 'url-missing' && i.severity === 'error')).toBe(true);
  });

  it('accepts expected URL evidence from links', () => {
    const r = buildVerifyResult(
      { text: 'Try Tutti https://tutti.komm64.com/', hasImages: false, expectedUrls: ['https://tutti.komm64.com/'] },
      { text: 'Try Tutti', hasImages: false, links: ['https://tutti.komm64.com/?ref=tumblr'] },
    );
    expect(r.issues).toEqual([]);
  });
});
