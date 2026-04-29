import { describe, expect, it } from 'vitest';
import { splitText } from './split';

describe('splitText', () => {
  it('上限以下なら 1 チャンクで返す', () => {
    expect(splitText('hello', 280)).toEqual(['hello']);
  });

  it('空文字も 1 チャンクで返す', () => {
    expect(splitText('', 280)).toEqual(['']);
  });

  it('上限ぎりぎりは 1 チャンクで返す', () => {
    const text = 'a'.repeat(280);
    expect(splitText(text, 280)).toEqual([text]);
  });

  it('単語境界で分割する', () => {
    const text = 'word1 word2 word3 word4 word5';
    const chunks = splitText(text, 14); // 連番 6 文字 + 中身 8 文字程度
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(14));
  });

  it('連番プレフィックス "(N/M) " を付与する', () => {
    const long = 'a'.repeat(700);
    const chunks = splitText(long, 280);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    chunks.forEach((c, i) => {
      expect(c.startsWith(`(${i + 1}/${chunks.length}) `)).toBe(true);
    });
  });

  it('全チャンクが limit 以下に収まる', () => {
    const text = 'word '.repeat(500); // 約 2500 文字
    const limit = 280;
    const chunks = splitText(text, limit);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(limit));
  });

  it('日本語(空白なし)も limit 以下に分割する', () => {
    const ja = 'あ'.repeat(700); // CJK 700 文字
    const chunks = splitText(ja, 280);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(280));
  });

  it('単一の超長語は途中で切る(やむを得ず)', () => {
    const word = 'a'.repeat(500);
    const chunks = splitText(word, 100);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(100));
  });

  it('連番付与で更にチャンクが増えるケースでも全 chunk が limit 以下', () => {
    // 9 → 10 で連番が "(9/9) " から "(10/10) " になるエッジケース
    const text = ('word '.repeat(50)).trim();
    const limit = 30;
    const chunks = splitText(text, limit);
    chunks.forEach((c) => {
      expect(c.length).toBeLessThanOrEqual(limit);
    });
  });
});
