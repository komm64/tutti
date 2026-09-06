import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDiagnosticsReport, DIAGNOSTIC_TAB_TIMEOUT_MS } from './diagnostics';

const mocks = vi.hoisted(() => ({
  getLastSeenUsers: vi.fn(async () => ({})),
  getPostHistory: vi.fn(async () => []),
  getSettings: vi.fn(async () => ({})),
  getSelectorFeedDiagnostics: vi.fn(async () => null),
}));

vi.mock('../storage', () => ({
  getLastSeenUsers: mocks.getLastSeenUsers,
  getPostHistory: mocks.getPostHistory,
  getSettings: mocks.getSettings,
}));

vi.mock('../utils/selector-feed-runtime', () => ({
  getSelectorFeedDiagnostics: mocks.getSelectorFeedDiagnostics,
}));

vi.mock('../adapters/registry', () => ({
  adapters: { threads: {}, tumblr: {} },
  getAdapter: (platform: string) => ({
    matchUrl: (url: string) => url.includes(platform),
  }),
}));

describe('diagnostic tab timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { userAgent: 'diagnostics-test-agent' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps a responsive platform result when another selected tab never replies', async () => {
    vi.stubGlobal('browser', {
      tabs: {
        query: vi.fn(async () => [
          { id: 1, url: 'https://www.threads.com/' },
          { id: 2, url: 'https://www.tumblr.com/' },
        ]),
        sendMessage: vi.fn((tabId: number) => (
          tabId === 1
            ? new Promise(() => {})
            : Promise.resolve({
                type: 'DIAGNOSE_PLATFORM_RESULT',
                platform: 'tumblr',
                selectors: [{ name: 'postButton', selector: 'button', matchCount: 1 }],
                detectedUser: '<present>',
              })
        )),
      },
      runtime: {
        getManifest: vi.fn(() => ({ version: '0.5.51' })),
      },
    });

    const report = buildDiagnosticsReport({ platforms: ['threads', 'tumblr'] });
    await vi.advanceTimersByTimeAsync(DIAGNOSTIC_TAB_TIMEOUT_MS);

    await expect(report).resolves.toMatchObject({
      platforms: [expect.objectContaining({ platform: 'tumblr' })],
    });
  });
});
