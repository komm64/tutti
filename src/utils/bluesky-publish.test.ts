// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { BLUESKY_SELECTORS } from '../adapters/bluesky';
import { isBlueskyPublishIdle } from './bluesky-publish';

function composer(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('isBlueskyPublishIdle', () => {
  const selector = BLUESKY_SELECTORS.postButton;

  it('is busy while Bluesky uploads the media and hides Publish', () => {
    expect(isBlueskyPublishIdle(selector, composer('<div role="dialog">Uploading images...</div>'))).toBe(false);
  });

  it('is busy while Publish is disabled', () => {
    expect(isBlueskyPublishIdle(selector, composer('<button data-testid="composerPublishBtn" disabled>Post</button>'))).toBe(false);
    expect(isBlueskyPublishIdle(selector, composer('<button aria-label="Publish post" aria-disabled="true">Post</button>'))).toBe(false);
  });

  it('is idle when Publish is back and enabled', () => {
    expect(isBlueskyPublishIdle(selector, composer('<button data-testid="composerPublishBtn">Post</button>'))).toBe(true);
  });
});
