import { describe, expect, it } from 'vitest';
import { checkImageConstraint, checkVideoConstraint } from './registry';

describe('checkVideoConstraint', () => {
  it('未対応プラットフォームは null', () => {
    // bluesky は videoConstraints を持つ
    expect(checkVideoConstraint('bluesky', 30, 10 * 1024 * 1024)).toBeNull();
  });

  it('Bluesky 180s 超は拒否 (2024 緩和: 60s→180s)', () => {
    const err = checkVideoConstraint('bluesky', 200, 10 * 1024 * 1024);
    expect(err).toContain('尺');
    expect(err).toContain('180');
  });

  it('Bluesky 80MiB 超は拒否', () => {
    const err = checkVideoConstraint('bluesky', 30, 90 * 1024 * 1024);
    expect(err).toContain('ファイルサイズ');
  });

  it('Mastodon は尺制限なし(0 = 制限なし)', () => {
    expect(checkVideoConstraint('mastodon', 9999, 10 * 1024 * 1024)).toBeNull();
  });

  it('X は free tier 140s 超を拒否', () => {
    const err = checkVideoConstraint('x', 200, 10 * 1024 * 1024);
    expect(err).toContain('尺');
    expect(err).toContain('140');
  });

  it('Threads は 300s 超を拒否 (5min cap)', () => {
    const err = checkVideoConstraint('threads', 400, 10 * 1024 * 1024);
    expect(err).toContain('尺');
    expect(err).toContain('300');
  });
});

describe('checkImageConstraint', () => {
  it('上限以下は null', () => {
    expect(checkImageConstraint('x', [1024 * 1024])).toBeNull();
  });

  it('Bluesky 2MB 超は拒否 (atproto spec maxSize=2,000,000)', () => {
    const err = checkImageConstraint('bluesky', [3 * 1024 * 1024]);
    expect(err).toContain('1枚目');
    expect(err).toContain('大きすぎ');
  });

  it('複数枚で 2 枚目が超過してもインデックス込みで通知', () => {
    const err = checkImageConstraint('bluesky', [500 * 1024, 5 * 1024 * 1024]);
    expect(err).toContain('2枚目');
  });

  it('X は 4 枚まで', () => {
    const sizes = [1024, 1024, 1024, 1024, 1024];
    const err = checkImageConstraint('x', sizes);
    expect(err).toContain('多すぎ');
    expect(err).toContain('4');
  });

  it('Misskey は 16 枚まで', () => {
    const sizes = Array(16).fill(1024);
    expect(checkImageConstraint('misskey', sizes)).toBeNull();
    const over = Array(17).fill(1024);
    expect(checkImageConstraint('misskey', over)).toContain('16');
  });
});
