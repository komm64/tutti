// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTumblrTextCommand } from './tumblr-editor-driver';

const SOURCE = 'tutti-inject-res-v1';

function installEditor(): HTMLElement {
  document.body.innerHTML = `
    <div role="dialog">
      <div data-testid="gutenberg-editor">
        <p class="body" contenteditable="true"></p>
      </div>
    </div>
  `;
  return document.querySelector<HTMLElement>('.body')!;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Tumblr block editor driver', () => {
  it('returns the existing missing-target error', async () => {
    await expect(handleTumblrTextCommand({
      id: 'missing',
      selector: '.body',
      text: 'hello',
    }, SOURCE)).resolves.toEqual({
      source: SOURCE,
      id: 'missing',
      ok: false,
      error: 'Tumblr text target not found',
    });
  });

  it('accepts text inserted by the paste handler', async () => {
    const editor = installEditor();
    editor.addEventListener('paste', (event) => {
      editor.textContent = (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
    });

    const result = await handleTumblrTextCommand({
      id: 'paste',
      selector: '.body',
      text: 'hello Tumblr #tutti',
    }, SOURCE);

    expect(result).toEqual({ source: SOURCE, id: 'paste', ok: true, error: undefined });
    expect(editor.textContent).toBe('hello Tumblr #tutti');
  });

  it('accepts Tumblr moving hashtags out of the body', async () => {
    const editor = installEditor();
    editor.addEventListener('paste', () => {
      editor.textContent = 'hello Tumblr';
    });

    const result = await handleTumblrTextCommand({
      id: 'tags',
      selector: '.body',
      text: 'hello Tumblr #tutti',
    }, SOURCE);

    expect(result.ok).toBe(true);
  });

  it('falls back to plain insertion when URL paste validation fails', async () => {
    const editor = installEditor();
    const inputs: string[] = [];
    editor.addEventListener('paste', () => {
      editor.textContent = 'generated link preview';
    });
    editor.addEventListener('input', (event) => {
      inputs.push((event as InputEvent).inputType);
    });

    const result = await handleTumblrTextCommand({
      id: 'url',
      selector: '.body',
      text: 'Read this\n\nhttps://tutti.komm64.com/',
    }, SOURCE);

    expect(result.ok).toBe(true);
    expect(editor.textContent).toContain('https://tutti.komm64.com/');
    expect(inputs).toContain('insertText');
  });
});
