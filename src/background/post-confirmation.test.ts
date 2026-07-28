import { describe, expect, it } from 'vitest';
import {
  buildVerifyExpectationForChunk,
  isAmbiguousPostDispatchError,
} from './post-confirmation';

describe('post confirmation', () => {
  it('expects media only on the first chunk of a split post', () => {
    const image = {
      name: 'photo.png',
      type: 'image/png',
      data: 'AA==',
    };
    expect(buildVerifyExpectationForChunk(
      'x',
      ['first', 'second'],
      'first second',
      [image],
      0,
    )).toMatchObject({
      text: 'first',
      hasImages: true,
    });
    expect(buildVerifyExpectationForChunk(
      'x',
      ['first', 'second'],
      'first second',
      [image],
      1,
    )).toMatchObject({
      text: 'second',
      hasImages: false,
    });
  });

  it('adds expected URLs only for platforms whose verifier needs them', () => {
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
