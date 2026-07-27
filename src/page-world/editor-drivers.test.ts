// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  injectContentEditableText,
  injectNativeText,
  resolveTextEditorDriver,
} from './editor-drivers';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('page-world editor drivers', () => {
  it('selects native, Lexical, Draft.js, and generic contenteditable drivers', () => {
    document.body.innerHTML = `
      <input id="input">
      <textarea id="textarea"></textarea>
      <div data-lexical-editor><div id="lexical" contenteditable="true"></div></div>
      <div class="DraftEditor-root"><div id="draft" contenteditable="true"></div></div>
      <div id="generic" contenteditable="true"></div>
    `;

    expect(resolveTextEditorDriver(document.querySelector('#input')!)).toBe('native');
    expect(resolveTextEditorDriver(document.querySelector('#textarea')!)).toBe('native');
    expect(resolveTextEditorDriver(document.querySelector('#lexical')!)).toBe('lexical');
    expect(resolveTextEditorDriver(document.querySelector('#draft')!)).toBe('draft');
    expect(resolveTextEditorDriver(document.querySelector('#generic')!)).toBe('contenteditable');
  });

  it.each(['input', 'textarea'])(
    'uses the native value setter and input/change order for %s',
    (tag) => {
      document.body.innerHTML = `<${tag}></${tag}>`;
      const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(tag)!;
      const events: string[] = [];
      element.addEventListener('input', () => events.push('input'));
      element.addEventListener('change', () => events.push('change'));

      injectNativeText(element, 'hello 😀');

      expect(element.value).toBe('hello 😀');
      expect(events).toEqual(['input', 'change']);
    },
  );

  it('accepts framework paste handling without firing the fallback input event', async () => {
    document.body.innerHTML = '<div contenteditable="true"></div>';
    const element = document.querySelector<HTMLElement>('div')!;
    const input = vi.fn();
    element.addEventListener('input', input);
    element.addEventListener('paste', (event) => {
      element.textContent = (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
    });

    await injectContentEditableText(element, 'pasted text');

    expect(element.textContent).toBe('pasted text');
    expect(input).not.toHaveBeenCalled();
  });

  it('replaces existing content and falls back to textContent plus input', async () => {
    document.body.innerHTML = '<div contenteditable="true">stale text</div>';
    const element = document.querySelector<HTMLElement>('div')!;
    const inputTypes: Array<string | undefined> = [];
    element.addEventListener('input', (event) => {
      inputTypes.push((event as InputEvent).inputType);
    });

    await injectContentEditableText(element, 'replacement', {
      waitFor: async () => false,
      sleep: async () => {},
    });

    expect(element.textContent).toBe('replacement');
    expect(inputTypes).toEqual(['insertText']);
  });
});
