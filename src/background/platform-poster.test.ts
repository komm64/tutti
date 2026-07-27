import { describe, expect, it } from 'vitest';
import type { PlatformAdapter } from '../adapters/types';
import {
  buildVerifyExpectationForChunk,
  getComposeUrlForMedia,
  isAmbiguousPostDispatchError,
  resolveApiPostOutcome,
} from './platform-poster';

function adapter(overrides: Partial<PlatformAdapter> = {}): PlatformAdapter {
  return {
    id: 'threads',
    name: 'Threads',
    charLimit: 500,
    popupOrder: 1,
    defaultSelected: true,
    matchUrl: (url) => url.startsWith('https://www.threads.com/'),
    getComposeUrl: (text) => `https://www.threads.com/intent/post?text=${encodeURIComponent(text)}`,
    prefillsViaUrl: true,
    imageConstraints: { maxBytesPerImage: 8 * 1024 * 1024, maxImages: 10 },
    kinds: ['text', 'image'],
    ...overrides,
  };
}

describe('platform poster helpers', () => {
  it('uses Tumblr video compose when posting video media', () => {
    const tumblr = adapter({
      id: 'tumblr',
      getComposeUrl: () => 'https://www.tumblr.com/new/text',
    });

    expect(getComposeUrlForMedia(tumblr, '', [{
      name: 'clip.mp4',
      type: 'video/mp4',
      data: 'AA==',
    }])).toBe('https://www.tumblr.com/new/video');
    expect(getComposeUrlForMedia(tumblr, 'hello')).toBe('https://www.tumblr.com/new/text');
  });

  it('expects media only on the first chunk of a split post', () => {
    const image = {
      name: 'photo.png',
      type: 'image/png',
      data: 'AA==',
    };
    expect(buildVerifyExpectationForChunk('x', ['first', 'second'], 'first second', [image], 0)).toMatchObject({
      text: 'first',
      hasImages: true,
    });
    expect(buildVerifyExpectationForChunk('x', ['first', 'second'], 'first second', [image], 1)).toMatchObject({
      text: 'second',
      hasImages: false,
    });
  });

  it('adds expected URLs only for Tumblr verify', () => {
    expect(buildVerifyExpectationForChunk(
      'tumblr',
      ['Try https://tutti.komm64.com/'],
      'Try https://tutti.komm64.com/',
      undefined,
      0,
    )).toMatchObject({
      expectedUrls: ['https://tutti.komm64.com/'],
    });
    expect(buildVerifyExpectationForChunk(
      'x',
      ['Try https://tutti.komm64.com/'],
      'Try https://tutti.komm64.com/',
      undefined,
      0,
    ).expectedUrls).toBeUndefined();
  });
});

describe('posting transport safety policy', () => {
  it('falls through to DOM only when the selected API path has no credentials', () => {
    expect(resolveApiPostOutcome('bluesky', 'no-credentials')).toBeNull();
  });

  it('keeps definitive API failures on the selected API transport', () => {
    expect(resolveApiPostOutcome('mastodon', {
      success: false,
      error: 'statuses 403: forbidden',
    })).toMatchObject({
      type: 'POST_RESULT',
      platform: 'mastodon',
      success: false,
      error: 'statuses 403: forbidden',
      flow: {
        attempt: 'api',
        submitReached: false,
        failedStep: 'api-post',
      },
    });
  });

  it('maps ambiguous or URL-less API outcomes to uncertain without another transport', () => {
    expect(resolveApiPostOutcome('bluesky', {
      success: false,
      uncertain: true,
      error: 'network interrupted',
    })).toMatchObject({
      success: false,
      uncertain: true,
      userAction: 'check-post-before-retry',
      flow: {
        attempt: 'api',
        submitReached: true,
        failedStep: 'capture-url',
      },
    });
    expect(resolveApiPostOutcome('misskey', {
      success: true,
    })).toMatchObject({
      success: false,
      uncertain: true,
      flow: {
        attempt: 'api',
        submitReached: true,
      },
    });
  });

  it('confirms API success only when a post URL is present', () => {
    expect(resolveApiPostOutcome('bluesky', {
      success: true,
      postUrl: 'https://bsky.app/profile/alice.test/post/abc',
    })).toMatchObject({
      success: true,
      confirmed: true,
      url: 'https://bsky.app/profile/alice.test/post/abc',
      flow: {
        attempt: 'api',
        submitReached: true,
        lastCompletedStep: 'api-create-post',
      },
    });
  });

  it('classifies channel-close and timeout failures as ambiguous after dispatch', () => {
    for (const message of [
      'A listener indicated an asynchronous response but the message channel closed',
      'The message port closed before a response was received.',
      'page entered the back/forward cache',
      'youtube content script response timed out after 240000ms',
    ]) {
      expect(isAmbiguousPostDispatchError(new Error(message)), message).toBe(true);
    }
    expect(isAmbiguousPostDispatchError(
      new Error('Could not establish connection. Receiving end does not exist.'),
    )).toBe(false);
  });
});
