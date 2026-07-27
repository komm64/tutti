import { describe, expect, it, vi } from 'vitest';
import {
  decodeInjectRequestMode,
  dispatchInjectRequest,
  INJECT_REQUEST_MODES,
  type InjectRequestHandlerMap,
  type InjectRequestMode,
} from './request-mode-dispatch';

interface TestRequest {
  mode: InjectRequestMode;
  value: string;
}

function createHandlers(): InjectRequestHandlerMap<TestRequest, string> {
  const handler = (mode: InjectRequestMode) =>
    vi.fn((request: TestRequest) => `${mode}:${request.value}`);
  return {
    input: handler('input'),
    drop: handler('drop'),
    text: handler('text'),
    'tumblr-text': handler('tumblr-text'),
    'tag-list': handler('tag-list'),
    click: handler('click'),
    'x-post-url': handler('x-post-url'),
  };
}

describe('request mode dispatch', () => {
  it('keeps the v1 wire mode set explicit', () => {
    expect(INJECT_REQUEST_MODES).toEqual([
      'input',
      'drop',
      'text',
      'tumblr-text',
      'tag-list',
      'click',
      'x-post-url',
    ]);
  });

  it.each(INJECT_REQUEST_MODES)('decodes supported mode %s', (mode) => {
    expect(decodeInjectRequestMode(mode)).toBe(mode);
  });

  it.each([undefined, null, '', 'unknown', 1, {}])(
    'preserves input fallback for unsupported mode %p',
    (mode) => {
      expect(decodeInjectRequestMode(mode)).toBe('input');
    },
  );

  it('dispatches through exactly the selected handler', async () => {
    const handlers = createHandlers();

    await expect(dispatchInjectRequest(
      { mode: 'tag-list', value: 'example' },
      handlers,
    )).resolves.toBe('tag-list:example');

    for (const mode of INJECT_REQUEST_MODES) {
      expect(handlers[mode]).toHaveBeenCalledTimes(mode === 'tag-list' ? 1 : 0);
    }
  });

  it('propagates handler failures to the entrypoint error boundary', async () => {
    const handlers = createHandlers();
    handlers.click = vi.fn().mockRejectedValue(new Error('click failed'));

    await expect(dispatchInjectRequest(
      { mode: 'click', value: 'example' },
      handlers,
    )).rejects.toThrow('click failed');
  });
});
