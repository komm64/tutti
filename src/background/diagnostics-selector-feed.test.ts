import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDiagnosticsReport } from './diagnostics';

const mocks = vi.hoisted(() => ({
  getLastSeenUsers: vi.fn(),
  getPostHistory: vi.fn(),
  getSettings: vi.fn(),
  getSelectorFeedDiagnostics: vi.fn(),
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
  adapters: {},
  getAdapter: vi.fn(),
}));

describe('selector feed manual diagnostics', () => {
  beforeEach(() => {
    vi.stubGlobal('browser', {
      tabs: {
        query: vi.fn(async () => []),
      },
      runtime: {
        getManifest: vi.fn(() => ({ version: '0.5.49' })),
      },
    });
    vi.stubGlobal('navigator', { userAgent: 'diagnostics-test-agent' });
    mocks.getSettings.mockResolvedValue({ selectorOverrideUrl: '<redacted in fixture>' });
    mocks.getLastSeenUsers.mockResolvedValue({});
    mocks.getPostHistory.mockResolvedValue([]);
    mocks.getSelectorFeedDiagnostics.mockResolvedValue({
      status: 'fallback',
      reason: 'unsupported-schema',
      checkedAt: 123,
      schemaVersion: 2,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('includes the PII-safe last feed outcome', async () => {
    const report = await buildDiagnosticsReport();

    expect(report.selectorFeed).toEqual({
      status: 'fallback',
      reason: 'unsupported-schema',
      checkedAt: 123,
      schemaVersion: 2,
    });
  });
});
