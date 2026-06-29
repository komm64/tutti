import { describe, expect, it } from 'vitest';
import {
  extractHttpUrls,
  hasUrlEvidence,
  mergeStandaloneUrlParagraphs,
  normalizeComparableUrl,
} from './text-urls';

describe('text URL helpers', () => {
  it('extracts HTTP URLs without trailing sentence punctuation', () => {
    expect(extractHttpUrls('Try https://tutti.komm64.com/. Also http://example.com/x?y=1!')).toEqual([
      'https://tutti.komm64.com/',
      'http://example.com/x?y=1',
    ]);
  });

  it('normalizes comparable URLs', () => {
    expect(normalizeComparableUrl('HTTPS://TUTTI.KOMM64.COM/#intro')).toBe('https://tutti.komm64.com');
  });

  it('finds URL evidence in visible text or extracted links', () => {
    expect(hasUrlEvidence('https://tutti.komm64.com/', { text: 'Visit tutti.komm64.com' })).toBe(true);
    expect(hasUrlEvidence('https://tutti.komm64.com/', { urls: ['https://tutti.komm64.com/?utm=1'] })).toBe(true);
    expect(hasUrlEvidence('https://tutti.komm64.com/', { text: 'Visit example.com' })).toBe(false);
  });

  it('merges a standalone trailing URL paragraph into the previous paragraph', () => {
    expect(mergeStandaloneUrlParagraphs('Try Tutti:\n\nhttps://tutti.komm64.com/')).toBe(
      'Try Tutti: https://tutti.komm64.com/',
    );
  });

  it('keeps normal paragraphs and inline URLs unchanged', () => {
    const text = 'First paragraph\n\nTry https://tutti.komm64.com/ here\n\nDone';
    expect(mergeStandaloneUrlParagraphs(text)).toBe(text);
  });

  it('moves leading standalone URLs into the next paragraph', () => {
    expect(mergeStandaloneUrlParagraphs('https://tutti.komm64.com/\n\nTry Tutti')).toBe(
      'https://tutti.komm64.com/ Try Tutti',
    );
  });
});
