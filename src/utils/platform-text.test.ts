import { describe, expect, it } from 'vitest';
import { measureTextForPlatform, splitTextForPlatform } from './platform-text';

describe('X weighted text length', () => {
  it.each([
    ['ASCII', 'a'.repeat(280), 280],
    ['Japanese', 'あ'.repeat(140), 280],
    ['Korean', '한'.repeat(140), 280],
    ['Chinese', '漢'.repeat(140), 280],
    ['full-width Latin', 'ａ'.repeat(140), 280],
    ['emoji', '😀'.repeat(140), 280],
    ['emoji ZWJ sequence', '👨‍👩‍👧‍👦'.repeat(140), 280],
  ])('%s uses the official X weight', (_label, text, expected) => {
    expect(measureTextForPlatform('x', text)).toBe(expected);
  });

  it('counts a URL as the fixed transformed length', () => {
    expect(measureTextForPlatform('x', `https://example.com/${'a'.repeat(200)}`)).toBe(23);
  });

  it('does not apply X weights to other platforms', () => {
    expect(measureTextForPlatform('bluesky', 'あ'.repeat(140))).toBe(140);
  });
});

describe('Bluesky grapheme length', () => {
  it('counts an emoji ZWJ sequence as one grapheme', () => {
    expect(measureTextForPlatform('bluesky', '👨‍👩‍👧‍👦'.repeat(300))).toBe(300);
  });

  it('splits over-limit emoji text into grapheme-safe chunks', () => {
    const chunks = splitTextForPlatform('bluesky', '👨‍👩‍👧‍👦'.repeat(301), 300);
    expect(chunks.length).toBe(2);
    chunks.forEach((chunk) => expect(measureTextForPlatform('bluesky', chunk)).toBeLessThanOrEqual(300));
  });
});

describe('X weighted text splitting', () => {
  it.each([
    ['Japanese', 'あ'.repeat(141)],
    ['Korean', '한'.repeat(141)],
    ['Chinese', '漢'.repeat(141)],
    ['full-width Latin', 'ａ'.repeat(141)],
    ['emoji', '😀'.repeat(141)],
    ['emoji ZWJ sequence', '👨‍👩‍👧‍👦'.repeat(141)],
  ])('splits over-limit %s text into valid chunks', (_label, text) => {
    const chunks = splitTextForPlatform('x', text, 280);
    expect(chunks.length).toBe(2);
    chunks.forEach((chunk) => expect(measureTextForPlatform('x', chunk)).toBeLessThanOrEqual(280));
  });

  it('keeps long URLs intact when splitting surrounding text', () => {
    const url = `https://example.com/${'a'.repeat(400)}`;
    const chunks = splitTextForPlatform('x', `${'a'.repeat(270)} ${url} tail`, 280);
    expect(chunks.some((chunk) => chunk.includes(url))).toBe(true);
    chunks.forEach((chunk) => expect(measureTextForPlatform('x', chunk)).toBeLessThanOrEqual(280));
  });
});
