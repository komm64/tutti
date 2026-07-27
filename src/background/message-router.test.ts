import { describe, expect, it, vi } from 'vitest';
import type { Message, PostRequestMessage, PostResultMessage } from '../messages';
import {
  BACKGROUND_MESSAGE_TYPES,
  createBackgroundMessageRouter,
  type BackgroundMessageRouterOptions,
} from './message-router';

function createOptions(
  overrides: Partial<BackgroundMessageRouterOptions> = {},
): BackgroundMessageRouterOptions {
  return {
    logBuffer: {
      load: vi.fn(async () => {}),
      entries: vi.fn(() => []),
      append: vi.fn(),
      appendBackground: vi.fn(),
      clear: vi.fn(),
    },
    userActionNotifier: {
      notify: vi.fn(async () => {}),
      handleNotificationClick: vi.fn(() => false),
    },
    userRefreshBroadcaster: {
      broadcast: vi.fn(),
    },
    postingState: {
      setCompression: vi.fn(),
      clearPostingState: vi.fn(),
      shouldClearBadgeOnRead: vi.fn(() => false),
      snapshot: vi.fn(() => ({
        compression: null,
        posting: false,
        postingState: null,
      })),
    },
    extensionUpdateManager: {
      getState: vi.fn(async () => ({ available: false })),
      applyUpdate: vi.fn(async () => ({ ok: true as const })),
    },
    setLastSeenUser: vi.fn(async () => {}),
    clearBadge: vi.fn(),
    handleBinaryChunkRequest: vi.fn(async () => {}),
    buildDiagnosticsReport: vi.fn(async () => ({} as never)),
    handlePostRequest: vi.fn(async () => []),
    ...overrides,
  };
}

describe('background message router', () => {
  it('declares the complete background-owned message registry', () => {
    expect(BACKGROUND_MESSAGE_TYPES).toEqual([
      'USER_ACTION_REQUIRED',
      'CURRENT_USER',
      'BROADCAST_REFRESH_USERS',
      'CONVERSION_PROGRESS',
      'CONVERSION_COMPLETE',
      'CONVERSION_ERROR',
      'CLEAR_POSTING_STATE',
      'GET_BG_STATE',
      'GET_EXTENSION_UPDATE_STATE',
      'APPLY_EXTENSION_UPDATE',
      'GET_BINARY_CHUNK',
      'LOG_APPEND',
      'LOG_EXPORT_REQUEST',
      'LOG_CLEAR',
      'DIAGNOSE_REQUEST',
      'POST_REQUEST',
    ]);
  });

  it('ignores malformed and non-background messages', () => {
    const options = createOptions();
    const router = createBackgroundMessageRouter(options);
    const sendResponse = vi.fn();

    expect(router({ nope: true }, {}, sendResponse)).toBeUndefined();
    expect(router(
      {
        type: 'POST_RESULT',
        platform: 'x',
        success: true,
      } satisfies Message,
      {},
      sendResponse,
    )).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('routes sender-aware fire-and-forget handlers', () => {
    const options = createOptions();
    const router = createBackgroundMessageRouter(options);

    expect(router(
      {
        type: 'USER_ACTION_REQUIRED',
        platform: 'threads',
        reason: 'captcha',
      },
      { tab: { id: 42 } },
      vi.fn(),
    )).toBeUndefined();
    expect(options.userActionNotifier.notify).toHaveBeenCalledWith('threads', 'captcha', 42);
  });

  it('routes storage, progress, refresh, and log commands without responses', () => {
    const options = createOptions();
    const router = createBackgroundMessageRouter(options);
    const sendResponse = vi.fn();
    const entry = {
      ts: 1,
      level: 'INFO' as const,
      context: 'test',
      message: 'hello',
    };

    expect(router(
      { type: 'CURRENT_USER', platform: 'x', username: 'alice' },
      {},
      sendResponse,
    )).toBeUndefined();
    expect(router({ type: 'BROADCAST_REFRESH_USERS' }, {}, sendResponse)).toBeUndefined();
    expect(router(
      { type: 'CONVERSION_PROGRESS', progress: 0.5, stage: 'load' },
      {},
      sendResponse,
    )).toBeUndefined();
    expect(router({ type: 'CONVERSION_COMPLETE', outputRef: 'ref', outputBytes: 10 }, {}, sendResponse))
      .toBeUndefined();
    expect(router({ type: 'CONVERSION_ERROR', error: 'failed' }, {}, sendResponse))
      .toBeUndefined();
    expect(router({ type: 'LOG_APPEND', entry }, {}, sendResponse)).toBeUndefined();
    expect(router({ type: 'LOG_CLEAR' }, {}, sendResponse)).toBeUndefined();

    expect(options.setLastSeenUser).toHaveBeenCalledWith({
      type: 'CURRENT_USER',
      platform: 'x',
      username: 'alice',
    });
    expect(options.userRefreshBroadcaster.broadcast).toHaveBeenCalledOnce();
    expect(options.postingState.setCompression).toHaveBeenNthCalledWith(1, {
      progress: 0.5,
      stage: 'load',
    });
    expect(options.postingState.setCompression).toHaveBeenNthCalledWith(2, null);
    expect(options.postingState.setCompression).toHaveBeenNthCalledWith(3, null);
    expect(options.logBuffer.append).toHaveBeenCalledWith(entry);
    expect(options.logBuffer.clear).toHaveBeenCalledOnce();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('preserves synchronous response and keep-alive behavior', () => {
    const options = createOptions();
    vi.mocked(options.postingState.shouldClearBadgeOnRead).mockReturnValue(true);
    const router = createBackgroundMessageRouter(options);
    const sendResponse = vi.fn();

    expect(router({ type: 'GET_BG_STATE' }, {}, sendResponse)).toBe(true);
    expect(options.clearBadge).toHaveBeenCalledOnce();
    expect(sendResponse).toHaveBeenCalledWith({
      compression: null,
      posting: false,
      postingState: null,
    });
  });

  it('keeps async diagnostics and binary responses alive', async () => {
    const report = { version: 'test' };
    const buildDiagnosticsReport = vi.fn(async () => report as never);
    const handleBinaryChunkRequest = vi.fn(async (
      _message: Extract<Message, { type: 'GET_BINARY_CHUNK' }>,
      sendResponse: (response?: unknown) => void,
    ) => {
      sendResponse({ chunk: 'AA==', totalSize: 1, end: 1 });
    });
    const options = createOptions({ buildDiagnosticsReport, handleBinaryChunkRequest });
    const router = createBackgroundMessageRouter(options);
    const diagnoseResponse = vi.fn();
    const binaryResponse = vi.fn();

    expect(router(
      { type: 'DIAGNOSE_REQUEST', platforms: ['x'] },
      {},
      diagnoseResponse,
    )).toBe(true);
    expect(router(
      { type: 'GET_BINARY_CHUNK', dataRef: 'ref', offset: 0, length: 1 },
      {},
      binaryResponse,
    )).toBe(true);

    await vi.waitFor(() => expect(diagnoseResponse).toHaveBeenCalledWith({ report }));
    await vi.waitFor(() => expect(binaryResponse).toHaveBeenCalledWith({
      chunk: 'AA==',
      totalSize: 1,
      end: 1,
    }));
    expect(buildDiagnosticsReport).toHaveBeenCalledWith(['x']);
  });

  it('decodes conservative POST_REQUEST defaults before async dispatch', async () => {
    const result: PostResultMessage = {
      type: 'POST_RESULT',
      platform: 'x',
      success: true,
      preview: true,
    };
    const handlePostRequest = vi.fn<
      (message: PostRequestMessage) => Promise<PostResultMessage[]>
    >(async () => [result]);
    const options = createOptions({ handlePostRequest });
    const router = createBackgroundMessageRouter(options);
    const sendResponse = vi.fn();

    expect(router(
      {
        type: 'POST_REQUEST',
        text: 'hello',
        platforms: ['x'],
        autoPost: true,
      },
      {},
      sendResponse,
    )).toBe(true);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ results: [result] }));
    const routed = handlePostRequest.mock.calls[0]![0];
    expect(routed.requestId).toEqual(expect.any(String));
    expect(routed.requestId.length).toBeGreaterThan(0);
    expect(routed.intent).toBe('retry');
    expect(options.logBuffer.appendBackground).toHaveBeenCalledWith(
      expect.stringContaining('POST_REQUEST contract defaulted requestId,intent'),
    );
  });
});
