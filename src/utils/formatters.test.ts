import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, formatRelTime } from './formatters';

describe('formatRelTime', () => {
  const NOW = 2_000_000_000_000;

  it('returns たった今 for < 60s', () => {
    expect(formatRelTime(NOW - 30_000, NOW)).toBe('たった今');
  });

  it('returns 分前 for < 60min', () => {
    expect(formatRelTime(NOW - 5 * 60_000, NOW)).toBe('5分前');
  });

  it('returns 時間前 for < 24h', () => {
    expect(formatRelTime(NOW - 3 * 3600_000, NOW)).toBe('3時間前');
  });

  it('returns 日前 for >= 24h', () => {
    expect(formatRelTime(NOW - 2 * 86400_000, NOW)).toBe('2日前');
  });

  it('rounds down (no rounding to nearest)', () => {
    expect(formatRelTime(NOW - 59_000, NOW)).toBe('たった今');
    expect(formatRelTime(NOW - 119_000, NOW)).toBe('1分前');
  });
});

describe('formatDuration', () => {
  it('formats single-digit seconds with padding', () => {
    expect(formatDuration(5)).toBe('0:05');
  });

  it('formats over a minute', () => {
    expect(formatDuration(75)).toBe('1:15');
  });

  it('floors fractional seconds', () => {
    expect(formatDuration(59.9)).toBe('0:59');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });
});

describe('formatBytes', () => {
  it('formats large bytes as MB with one decimal', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0MB');
    expect(formatBytes(1.7 * 1024 * 1024)).toBe('1.7MB');
  });

  it('formats small bytes as KB rounded', () => {
    expect(formatBytes(512 * 1024)).toBe('512KB');
    expect(formatBytes(1023 * 1024)).toBe('1023KB');
  });

  it('1MB boundary uses MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0MB');
  });
});
