import { beforeEach, describe, expect, it, vi } from 'vitest';
import postResponseFixture from '../fixtures/messages/post-response-additive.json';
import postResultFixture from '../fixtures/messages/post-result-additive.json';
import postToPlatformFixture from '../fixtures/messages/post-to-platform-additive.json';
import type { PostResultMessage } from '../messages';
import { sendPostRequest } from '../popup/post-submit';
import { bootstrapContentScript } from './content-script-bootstrap';

const mocks = vi.hoisted(() => ({
  buildDiagnosis: vi.fn(),
  detectAndReportUser: vi.fn(async () => undefined),
  initLogLevelFromSettings: vi.fn(async () => undefined),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('./diagnose', () => ({
  buildDiagnosis: mocks.buildDiagnosis,
}));

vi.mock('./user-detect', () => ({
  detectAndReportUser: mocks.detectAndReportUser,
}));

vi.mock('./logger', () => ({
  initLogLevelFromSettings: mocks.initLogLevelFromSettings,
  log: mocks.log,
}));

type RuntimeListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

function installContentBootstrap(
  runPost: () => Promise<PostResultMessage>,
): RuntimeListener {
  let listener: RuntimeListener | undefined;
  vi.stubGlobal('browser', {
    runtime: {
      onMessage: {
        addListener: vi.fn((next: RuntimeListener) => {
          listener = next;
        }),
      },
      sendMessage: vi.fn(async () => undefined),
    },
  });

  bootstrapContentScript({
    platform: 'x',
    selectors: { editor: '[data-testid="tweetTextarea_0"]' },
    detectUser: () => '@alice',
    runPost,
  });

  if (!listener) throw new Error('content bootstrap did not register its runtime listener');
  return listener;
}

describe('additive message wire fixtures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('processes known POST_TO_PLATFORM fields while allowing unknown request fields', async () => {
    const runPost = vi.fn(async () => postResultFixture as unknown as PostResultMessage);
    const listener = installContentBootstrap(runPost);

    const response = await new Promise<unknown>((resolve) => {
      expect(listener(postToPlatformFixture, {}, resolve)).toBe(true);
    });

    expect(runPost).toHaveBeenCalledOnce();
    expect(runPost).toHaveBeenCalledWith(
      'additive contract',
      expect.arrayContaining([
        expect.objectContaining({
          name: 'fixture.png',
          futureAttachmentField: { revision: 2 },
        }),
      ]),
      true,
      undefined,
      undefined,
      undefined,
    );
    expect(response).toMatchObject({
      type: 'POST_RESULT',
      platform: 'x',
      success: true,
      preview: true,
      futureResultField: {
        implementationRevision: 2,
      },
      flow: {
        mode: 'preview',
        submitReached: false,
        futureFlowField: 'preserve-me',
      },
    });
  });

  it('forwards the selected implementation path to the content posting flow', async () => {
    const runPost = vi.fn(async () => postResultFixture as unknown as PostResultMessage);
    const listener = installContentBootstrap(runPost);

    await new Promise<unknown>((resolve) => {
      expect(listener({
        ...postToPlatformFixture,
        implementationPath: 'next',
      }, {}, resolve)).toBe(true);
    });

    expect(runPost).toHaveBeenCalledWith(
      'additive contract',
      expect.any(Array),
      true,
      undefined,
      'next',
      undefined,
    );
  });

  it('forwards the pre-dispatch account to compact posting windows', async () => {
    const runPost = vi.fn(async () => postResultFixture as unknown as PostResultMessage);
    const listener = installContentBootstrap(runPost);

    await new Promise<unknown>((resolve) => {
      expect(listener({
        ...postToPlatformFixture,
        expectedUser: '@alice',
      }, {}, resolve)).toBe(true);
    });

    expect(runPost).toHaveBeenCalledWith(
      'additive contract',
      expect.any(Array),
      true,
      undefined,
      undefined,
      '@alice',
    );
  });

  it('ignores an unknown message type without invoking the post handler', () => {
    const runPost = vi.fn(async () => postResultFixture as unknown as PostResultMessage);
    const listener = installContentBootstrap(runPost);
    const sendResponse = vi.fn();

    expect(listener({
      type: 'FUTURE_MESSAGE_TYPE',
      futurePayload: { revision: 2 },
    }, {}, sendResponse)).toBeUndefined();
    expect(runPost).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('allows additive response and result fields at the popup boundary', async () => {
    const sent: unknown[] = [];
    const response = await sendPostRequest({
      text: 'additive contract',
      platforms: ['x'],
      images: [],
      video: null,
      imageAlts: [],
      autoPost: false,
      cw: '',
      visibility: 'public',
      trimToS: null,
      intent: 'new',
    }, async (message) => {
      sent.push(message);
      return postResponseFixture;
    });

    expect(sent[0]).toMatchObject({
      type: 'POST_REQUEST',
      requestId: expect.any(String),
      intent: 'new',
      text: 'additive contract',
      autoPost: false,
    });
    expect(response).toMatchObject({
      results: [
        {
          type: 'POST_RESULT',
          platform: 'x',
          preview: true,
          futureResultField: {
            implementationRevision: 2,
          },
        },
      ],
      futureResponseField: {
        protocolRevision: 2,
      },
    });
  });
});
