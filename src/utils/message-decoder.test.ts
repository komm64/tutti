import { describe, expect, it } from 'vitest';
import postRequestFixture from '../fixtures/messages/post-request-additive.json';
import postResultFixture from '../fixtures/messages/post-result-additive.json';
import postToPlatformFixture from '../fixtures/messages/post-to-platform-additive.json';
import type { Message, PostResultMessage } from '../messages';
import { PLATFORM_IDS } from '../types/platform';
import { decodeMessage, decodeMessageWithDiagnostics } from './message-decoder';

it('keeps the canonical runtime platform ID vocabulary stable', () => {
  expect(PLATFORM_IDS).toEqual([
    'x',
    'bluesky',
    'threads',
    'mastodon',
    'misskey',
    'tumblr',
    'pixiv',
    'deviantart',
    'instagram',
    'tiktok',
    'youtube',
  ]);
});

const postResult: PostResultMessage = {
  type: 'POST_RESULT',
  platform: 'x',
  success: true,
};

const currentMessageSamples: Message[] = [
  {
    type: 'POST_REQUEST',
    requestId: 'sample-request-id',
    intent: 'new',
    text: 'sample',
    platforms: ['x'],
  },
  { type: 'POST_TO_PLATFORM', platform: 'x', text: 'sample' },
  postResult,
  { type: 'PLATFORM_PROGRESS', result: postResult },
  { type: 'GET_EXTENSION_UPDATE_STATE' },
  { type: 'APPLY_EXTENSION_UPDATE' },
  { type: 'EXTENSION_UPDATE_AVAILABLE', state: { available: true, version: '1.0.0' } },
  { type: 'CURRENT_USER', platform: 'x', username: null },
  {
    type: 'CONVERT_VIDEO',
    inputRef: 'input',
    mimeType: 'video/mp4',
    durationS: 10,
    targetBytes: 1_000,
  },
  { type: 'CONVERSION_PROGRESS', progress: 0.5, stage: 'transcode' },
  { type: 'CONVERSION_COMPLETE', outputRef: 'output', outputBytes: 500 },
  { type: 'CONVERSION_ERROR', error: 'sample' },
  { type: 'DIAGNOSE_REQUEST', platforms: ['x'] },
  { type: 'DIAGNOSE_PLATFORM', platform: 'x' },
  {
    type: 'DIAGNOSE_PLATFORM_RESULT',
    platform: 'x',
    url: 'https://x.com/',
    selectors: [{
      name: 'editor',
      selector: '[contenteditable]',
      matchCount: 1,
      firstMatchPreview: null,
    }],
    detectedUser: null,
    domSnapshot: null,
  },
  {
    type: 'LOG_APPEND',
    entry: { ts: 1, level: 'INFO', context: 'test', message: 'sample' },
  },
  { type: 'LOG_EXPORT_REQUEST' },
  { type: 'GET_BG_STATE' },
  { type: 'CLEAR_POSTING_STATE' },
  { type: 'POSTING_MEDIA_FOCUS', phase: 'acquire' },
  { type: 'GET_BINARY_CHUNK', dataRef: 'data', offset: 0, length: 1 },
  { type: 'GET_BLUESKY_SESSION' },
  {
    type: 'BLUESKY_SESSION_RESULT',
    accessJwt: 'jwt',
    did: 'did:plc:sample',
    handle: 'sample.test',
  },
  { type: 'VERIFY_POST_DOM' },
  {
    type: 'VERIFY_POST_DOM_RESULT',
    ogDescription: '',
    ogImage: '',
    bodyExcerpt: '',
  },
  { type: 'REFRESH_USER' },
  { type: 'BROADCAST_REFRESH_USERS' },
  { type: 'USER_ACTION_REQUIRED', platform: 'x', reason: 'captcha' },
  { type: 'LOG_CLEAR' },
];

describe('runtime message decoder', () => {
  it('accepts a compile-time checked sample of every current message type', () => {
    for (const sample of currentMessageSamples) {
      expect(decodeMessage(sample)).toBe(sample);
    }
  });

  it.each([
    ['POST_REQUEST', postRequestFixture],
    ['POST_TO_PLATFORM', postToPlatformFixture],
    ['POST_RESULT', postResultFixture],
  ])('accepts additive fields on %s without copying or stripping them', (_type, fixture) => {
    const decoded = decodeMessage(fixture);

    expect(decoded).toBe(fixture);
    expect(decoded).toMatchObject(fixture);
  });

  it('ignores unknown message types', () => {
    expect(decodeMessage({
      type: 'FUTURE_MESSAGE_TYPE',
      futurePayload: { revision: 2 },
    })).toBeUndefined();
  });

  it.each([
    ['missing intent', undefined],
    ['unknown intent', 'future-intent'],
  ])('defaults %s conservatively for a potentially real post', (_label, intent) => {
    const decoded = decodeMessageWithDiagnostics({
      type: 'POST_REQUEST',
      text: 'legacy real post',
      platforms: ['x'],
      autoPost: true,
      intent,
    });

    expect(decoded?.message).toMatchObject({
      type: 'POST_REQUEST',
      intent: 'retry',
    });
    expect((decoded?.message as { requestId?: string }).requestId).toEqual(expect.any(String));
    expect(decoded?.diagnostics).toMatchObject({
      requestIdDefaulted: true,
      intentDefaulted: true,
    });
  });

  it('defaults a legacy preview intent to new without treating it as a real post', () => {
    const decoded = decodeMessageWithDiagnostics({
      type: 'POST_REQUEST',
      text: 'legacy preview',
      platforms: ['x'],
      autoPost: false,
    });

    expect(decoded?.message).toMatchObject({
      type: 'POST_REQUEST',
      intent: 'new',
    });
    expect(decoded?.diagnostics.intentDefaulted).toBe(true);
  });

  it('preserves explicit request identity and intent without diagnostics', () => {
    const decoded = decodeMessageWithDiagnostics(postRequestFixture);

    expect(decoded?.message).toBe(postRequestFixture);
    expect(decoded?.diagnostics).toEqual({});
  });

  it('accepts structured SubmissionGuard results and rejects malformed known fields', () => {
    expect(decodeMessage({
      ...postResult,
      submissionGuard: {
        decision: 'blocked',
        reason: 'in-flight',
        requestId: 'request-1',
        futureEvidence: true,
      },
    })).toMatchObject({
      submissionGuard: {
        decision: 'blocked',
        reason: 'in-flight',
        requestId: 'request-1',
        futureEvidence: true,
      },
    });
    expect(decodeMessage({
      ...postResult,
      submissionGuard: {
        decision: 'future-decision',
        requestId: 'request-1',
      },
    })).toBeUndefined();
  });

  it('accepts only explicit legacy or next implementation paths on content messages', () => {
    expect(decodeMessage({
      type: 'POST_TO_PLATFORM',
      platform: 'x',
      text: 'sample',
      implementationPath: 'next',
    })).toMatchObject({ implementationPath: 'next' });
    expect(decodeMessage({
      type: 'POST_TO_PLATFORM',
      platform: 'x',
      text: 'sample',
      implementationPath: 'future',
    })).toBeUndefined();
  });

  it.each([
    null,
    [],
    { type: 'POST_REQUEST', text: 'missing platforms' },
    { type: 'POST_REQUEST', text: 'bad platform', platforms: ['future-network'] },
    { type: 'POST_TO_PLATFORM', platform: 'x', text: 123 },
    { type: 'POST_RESULT', platform: 'x', success: 'yes' },
    {
      type: 'POST_RESULT',
      platform: 'x',
      success: true,
      flow: { submitReached: 'no' },
    },
  ])('rejects malformed known message %#', (value) => {
    expect(decodeMessage(value)).toBeUndefined();
  });

  it('accepts all current tag-only messages', () => {
    for (const type of [
      'GET_EXTENSION_UPDATE_STATE',
      'APPLY_EXTENSION_UPDATE',
      'LOG_EXPORT_REQUEST',
      'GET_BG_STATE',
      'CLEAR_POSTING_STATE',
      'GET_BLUESKY_SESSION',
      'VERIFY_POST_DOM',
      'REFRESH_USER',
      'BROADCAST_REFRESH_USERS',
      'LOG_CLEAR',
    ]) {
      expect(decodeMessage({ type, futureField: true })).toMatchObject({ type });
    }
  });
});
