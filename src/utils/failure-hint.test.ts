import { describe, expect, it } from 'vitest';
import { classifyFailure } from './failure-hint';

describe('classifyFailure', () => {
  it('catches login-required pattern (Japanese)', () => {
    const h = classifyFailure('投稿入力欄が見つかりませんでした。ログイン済みか確認してください', 'x', 'https://x.com/');
    expect(h.reason).toMatch(/ログイン/);
    expect(h.ctas.find((c) => c.kind === 'open-sns')).toBeDefined();
  });

  it('catches 401 unauthorized', () => {
    const h = classifyFailure('API 401 Unauthorized', 'bluesky', 'https://bsky.app/');
    expect(h.reason).toMatch(/ログイン/);
  });

  it('catches multi-account mismatch', () => {
    const h = classifyFailure(
      'x: 想定していたアカウント (@a) と現在のアカウント (@b) が違います',
      'x',
      'https://x.com/',
    );
    expect(h.reason).toMatch(/アカウント/);
    expect(h.ctas.find((c) => c.kind === 'open-sns')).toBeDefined();
  });

  it('catches captcha (Pixiv security check)', () => {
    const h = classifyFailure('Pixiv: Security check で post button disabled', 'pixiv', undefined);
    expect(h.reason).toMatch(/captcha/);
  });

  it('catches size over limit', () => {
    const h = classifyFailure('Video too large: 200MB exceeds 100MB limit', 'bluesky', undefined);
    expect(h.reason).toMatch(/上限/);
  });

  it('catches timeout', () => {
    const h = classifyFailure('SNS ページの読み込みがタイムアウトしました', 'mastodon', undefined);
    expect(h.reason).toMatch(/タイムアウト/);
  });

  it('catches duplicate / rate-limit', () => {
    const h = classifyFailure('Duplicate post detected', 'x', undefined);
    expect(h.reason).toMatch(/重複|rate-limit/);
    expect(h.ctas.find((c) => c.kind === 'wait')).toBeDefined();
  });

  it('catches selector breakage', () => {
    const h = classifyFailure('投稿ボタンが見つかりませんでした。SNS の UI が更新された可能性があります', 'tiktok', undefined);
    expect(h.reason).toMatch(/UI/);
    expect(h.ctas.find((c) => c.kind === 'report')).toBeDefined();
  });

  it('falls back to generic for unknown errors', () => {
    const h = classifyFailure('Something completely unexpected', 'x', undefined);
    expect(h.reason).toBe('原因不明のエラー');
    expect(h.guidance).toContain('Something completely unexpected');
    expect(h.ctas.find((c) => c.kind === 'retry')).toBeDefined();
    expect(h.ctas.find((c) => c.kind === 'report')).toBeDefined();
  });
});
