import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenedTabRegistry } from './opened-tab-registry';

describe('createOpenedTabRegistry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('closes owned tabs for uncertain post results so retries start cleanly', async () => {
    const remove = vi.fn(async () => undefined);
    vi.stubGlobal('browser', {
      tabs: { remove },
    });

    const registry = createOpenedTabRegistry();
    registry.record('tumblr', 123);

    await registry.cleanup([{
      type: 'POST_RESULT',
      platform: 'tumblr',
      success: false,
      uncertain: true,
      userAction: 'check-post-before-retry',
    }]);

    expect(remove).toHaveBeenCalledWith(123);
  });

  it('forgets a failed pre-submit attempt tab after the caller closes it', async () => {
    const remove = vi.fn(async () => undefined);
    vi.stubGlobal('browser', {
      tabs: { remove },
    });

    const registry = createOpenedTabRegistry();
    registry.record('tumblr', 123);
    registry.forget('tumblr', 123);

    await registry.cleanup([{
      type: 'POST_RESULT',
      platform: 'tumblr',
      success: true,
      url: 'https://www.tumblr.com/example/1',
    }]);

    expect(remove).not.toHaveBeenCalled();
  });
});
