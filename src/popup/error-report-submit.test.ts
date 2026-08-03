import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPopupReportPayload,
  REPORT_RUNTIME_MESSAGE_TIMEOUT_MS,
  REPORT_SUBMIT_TIMEOUT_MS,
  submitPopupErrorReport,
} from './error-report-submit';

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(async () => ({ disableReportDedup: true })),
  hashReportKey: vi.fn(async () => 'report-hash'),
  isRecentlyReported: vi.fn(async () => null),
  markReported: vi.fn(async () => undefined),
}));

vi.mock('../storage', () => ({ getSettings: mocks.getSettings }));
vi.mock('../utils/report-dedup', () => ({
  hashReportKey: mocks.hashReportKey,
  isRecentlyReported: mocks.isRecentlyReported,
  markReported: mocks.markReported,
}));

const context = {
  version: '0.5.51',
  text: 'draft',
  platforms: [{ id: 'threads', available: true }],
  selected: { threads: true },
  images: [],
  video: null,
  imageAlts: [],
  cw: '',
  visibility: 'public',
  trimToS: null,
  lastResults: null,
} as never;

describe('popup error report submission', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('continues without diagnostics when the background message stalls', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('browser', {
      runtime: {
        sendMessage: vi.fn((message: { type: string }) => (
          message.type === 'LOG_EXPORT_REQUEST'
            ? Promise.resolve({ entries: [] })
            : new Promise(() => {})
        )),
      },
    });

    const payload = buildPopupReportPayload('posting failed', context);
    await vi.advanceTimersByTimeAsync(REPORT_RUNTIME_MESSAGE_TIMEOUT_MS);

    await expect(payload).resolves.toMatchObject({
      title: expect.stringContaining('posting failed'),
      body: expect.stringContaining('posting failed'),
    });
  });

  it('aborts a stalled proxy request and returns a failure instead of submitting forever', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('browser', {
      runtime: {
        sendMessage: vi.fn(async () => ({ entries: [] })),
      },
    });
    const fetchMock = vi.fn((_url: string, init: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      })
    ));
    vi.stubGlobal('fetch', fetchMock);

    const result = submitPopupErrorReport({
      errorText: 'posting failed',
      context,
      endpoint: 'https://report.example.test',
      dedupedMessage: (hours) => `deduped ${hours}`,
    });
    await vi.advanceTimersByTimeAsync(REPORT_SUBMIT_TIMEOUT_MS);

    await expect(result).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('timed out'),
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
