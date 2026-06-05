import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, formatRelTime } from './formatters';

describe('formatRelTime', () => {
  const NOW = 2_000_000_000_000;

  it('returns a "now" equivalent for < 60s', () => {
    const result = formatRelTime(NOW - 30_000, NOW);
    expect(result).toMatch(/now|just now|0 seconds ago/i);
  });

  it('returns minutes ago for < 60min', () => {
    const result = formatRelTime(NOW - 5 * 60_000, NOW);
    expect(result).toMatch(/5.*(min|分)/i);
  });

  it('returns hours ago for < 24h', () => {
    const result = formatRelTime(NOW - 3 * 3600_000, NOW);
    expect(result).toMatch(/3.*(hour|時)/i);
  });

  it('returns days ago for >= 24h', () => {
    const result = formatRelTime(NOW - 2 * 86400_000, NOW);
    expect(result).toMatch(/2.*(day|日)/i);
  });

  it('rounds down (no rounding to nearest)', () => {
    const r1 = formatRelTime(NOW - 59_000, NOW);
    expect(r1).toMatch(/now|just now|0 seconds ago/i);
    const r2 = formatRelTime(NOW - 119_000, NOW);
    expect(r2).toMatch(/1.*(min|分)/i);
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
