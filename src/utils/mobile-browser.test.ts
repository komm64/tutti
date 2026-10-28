import { describe, expect, it } from 'vitest';
import { isMobileBrowser } from './mobile-browser';

describe('isMobileBrowser', () => {
  it('detects Android Chromium from the user agent', () => {
    expect(isMobileBrowser({
      userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
    })).toBe(true);
  });

  it('trusts userAgentData.mobile', () => {
    expect(isMobileBrowser({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', userAgentData: { mobile: true } })).toBe(true);
  });

  it('allows desktop Chromium', () => {
    expect(isMobileBrowser({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
      userAgentData: { mobile: false },
    })).toBe(false);
  });
});
