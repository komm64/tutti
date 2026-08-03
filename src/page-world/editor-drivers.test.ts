// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  injectContentEditableText,
  injectXDraftText,
  injectNativeText,
  resolveTextEditorDriver,
  shouldUseDirectLexicalState,
  shouldUseXEditorPaste,
  splitXDraftTextSegments,
} from './editor-drivers';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('page-world editor drivers', () => {
  it('splits X hashtags and mentions into remount-safe typing segments', () => {
    expect(splitXDraftTextSegments('body #tag and @user')).toEqual([
      { kind: 'paste', text: 'body ' },
      { kind: 'type', text: '#tag' },
      { kind: 'paste', text: ' and ' },
      { kind: 'type', text: '@user' },
    ]);
  });

  it('retries one X entity character lost during a Draft editor remount', async () => {
    document.body.innerHTML = '<div data-testid="tweetTextarea_3" contenteditable="true"></div>';
    let current = document.querySelector<HTMLElement>('[data-testid="tweetTextarea_3"]')!;
    const installPaste = (element: HTMLElement) => {
      element.addEventListener('paste', (event) => {
        element.textContent += (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
      });
    };
    installPaste(current);
    let lostFirstTagCharacter = false;

    const result = await injectXDraftText(current, 'body #tag', {
      resolveCurrent: () => current,
      waitFor: async (predicate) => predicate(),
      sleep: async () => {},
      insertText: (element, character) => {
        const before = element.textContent ?? '';
        element.textContent = `${before}${character}`;
        if (character === 't' && !lostFirstTagCharacter) {
          lostFirstTagCharacter = true;
          const replacement = document.createElement('div');
          replacement.setAttribute('data-testid', 'tweetTextarea_3');
          replacement.setAttribute('contenteditable', 'true');
          replacement.textContent = before;
          installPaste(replacement);
          element.replaceWith(replacement);
          current = replacement;
        }
        return true;
      },
    });

    expect(lostFirstTagCharacter).toBe(true);
    expect(result).toBe(current);
    expect(current.textContent).toBe('body #tag');
  });

  it('selects native, Lexical, Draft.js, and generic contenteditable drivers', () => {
    document.body.innerHTML = `
      <input id="input">
      <textarea id="textarea"></textarea>
      <div data-lexical-editor><div id="lexical" contenteditable="true"></div></div>
      <div id="x-editor" data-testid="tweetTextarea_1" contenteditable="true"></div>
      <div class="DraftEditor-root">
        <div id="x-draft" class="public-DraftEditor-content" data-testid="tweetTextarea_0" contenteditable="true"></div>
      </div>
      <div class="DraftEditor-root"><div id="draft" contenteditable="true"></div></div>
      <div id="generic" contenteditable="true"></div>
    `;

    expect(resolveTextEditorDriver(document.querySelector('#input')!)).toBe('native');
    expect(resolveTextEditorDriver(document.querySelector('#textarea')!)).toBe('native');
    expect(resolveTextEditorDriver(document.querySelector('#lexical')!)).toBe('lexical');
    expect(resolveTextEditorDriver(document.querySelector('#x-editor')!)).toBe('lexical');
    expect(resolveTextEditorDriver(document.querySelector('#x-draft')!)).toBe('lexical');
    expect(resolveTextEditorDriver(document.querySelector('#draft')!)).toBe('draft');
    expect(resolveTextEditorDriver(document.querySelector('#generic')!)).toBe('contenteditable');
  });

  it('uses X paste handling for every exact tweet editor', () => {
    document.body.innerHTML = `
      <div id="first" data-testid="tweetTextarea_0" contenteditable="true"></div>
      <div id="follow-up" data-testid="tweetTextarea_1" contenteditable="true"></div>
      <div id="later" data-testid="tweetTextarea_12" contenteditable="true"></div>
    `;

    expect(shouldUseDirectLexicalState(
      'x.com',
      document.querySelector<HTMLElement>('#first')!,
    )).toBe(false);
    expect(shouldUseDirectLexicalState(
      'x.com',
      document.querySelector<HTMLElement>('#follow-up')!,
    )).toBe(false);
    expect(shouldUseDirectLexicalState(
      'x.com',
      document.querySelector<HTMLElement>('#later')!,
    )).toBe(false);
    expect(shouldUseXEditorPaste(
      'x.com',
      document.querySelector<HTMLElement>('#first')!,
    )).toBe(true);
    expect(shouldUseXEditorPaste(
      'x.com',
      document.querySelector<HTMLElement>('#follow-up')!,
    )).toBe(true);
    expect(shouldUseXEditorPaste(
      'twitter.com',
      document.querySelector<HTMLElement>('#follow-up')!,
    )).toBe(false);
  });

  it('keeps direct Lexical state for Instagram and Threads editors', () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true"></div>';
    const editor = document.querySelector<HTMLElement>('#editor')!;

    expect(shouldUseDirectLexicalState('www.instagram.com', editor)).toBe(true);
    expect(shouldUseDirectLexicalState('www.threads.com', editor)).toBe(true);
    expect(shouldUseDirectLexicalState('example.com', editor)).toBe(false);
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
