// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findElementBySelectorList,
  handleClickCommand,
  handleTagListCommand,
} from './element-commands';

const SOURCE = 'tutti-inject-res-v1';
const noSleep = async (): Promise<void> => {};

beforeEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('page-world element commands', () => {
  it('resolves selector lists in order and can prefer visible targets', () => {
    document.body.innerHTML = `
      <button class="first">hidden</button>
      <button class="first visible">visible</button>
      <button class="second">second</button>
    `;

    const first = findElementBySelectorList('.first, .second');
    const visible = findElementBySelectorList('.first, .second', {
      preferVisible: true,
      isVisible: (element) => element.classList.contains('visible'),
    });

    expect(first?.el.textContent).toBe('hidden');
    expect(first?.matchedPart).toBe('.first');
    expect(visible?.el.textContent).toBe('visible');
  });

  it('commits tags through the controlled-input event sequence', async () => {
    document.body.innerHTML = '<input class="tags">';
    const input = document.querySelector<HTMLInputElement>('input')!;
    const events: string[] = [];
    const tracker = { setValue: vi.fn() };
    Object.assign(input, { _valueTracker: tracker });
    for (const type of ['input', 'change', 'keydown', 'keypress', 'keyup']) {
      input.addEventListener(type, () => {
        events.push(type);
        if (type === 'keydown') input.value = '';
      });
    }

    const result = await handleTagListCommand({
      id: 'tag-1',
      selector: '.tags',
      tags: ['tutti', 'test1'],
    }, SOURCE, { sleep: noSleep });

    expect(result).toEqual({ source: SOURCE, id: 'tag-1', ok: true, error: undefined });
    expect(tracker.setValue).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      'input', 'change', 'keydown', 'keypress', 'keyup',
      'input', 'change', 'keydown', 'keypress', 'keyup',
    ]);
  });

  it('preserves tag target and uncommitted errors', async () => {
    document.body.innerHTML = '<div class="not-input"></div>';
    await expect(handleTagListCommand({
      id: 'tag-2',
      selector: '.not-input',
      tags: ['tutti'],
    }, SOURCE)).resolves.toMatchObject({
      ok: false,
      error: 'tag-list mode only supports <input> and <textarea> elements',
    });

    document.body.innerHTML = '<textarea class="tags"></textarea>';
    await expect(handleTagListCommand({
      id: 'tag-3',
      selector: '.tags',
      tags: ['tutti'],
    }, SOURCE, {
      sleep: noSleep,
      waitFor: async () => false,
    })).resolves.toMatchObject({
      ok: false,
      error: 'no tags committed (tried 1)',
    });
  });

  it('clicks the first enabled exact-text match', async () => {
    document.body.innerHTML = `
      <button aria-label="Post" disabled>disabled</button>
      <button aria-label="Cancel">Post</button>
      <button aria-label="Post now">target</button>
    `;
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
    const clicks = buttons.map((button) => vi.spyOn(button, 'click'));

    const result = await handleClickCommand({
      id: 'click-1',
      selector: 'button',
      texts: ['Post now'],
    }, SOURCE, { hostname: 'example.com' });

    expect(result.ok).toBe(true);
    expect(clicks.map((click) => click.mock.calls.length)).toEqual([0, 0, 1]);
  });

  it.each(['x.com', 'twitter.com'])('activates the %s Add post keyboard handler exactly once per new editor', async (hostname) => {
    document.body.innerHTML = `
      <div data-testid="tweetTextarea_0" contenteditable="true">first</div>
      <button data-testid="addButton">Add</button>
    `;
    const button = document.querySelector<HTMLButtonElement>('button')!;
    const click = vi.spyOn(button, 'click');
    let editorCount = 1;
    const addEditor = () => {
      const editor = document.createElement('div');
      editor.dataset.testid = `tweetTextarea_${editorCount++}`;
      editor.contentEditable = 'true';
      button.before(editor);
    };
    button.addEventListener('click', addEditor);
    // Sending both keyboard and click events can add two empty chunks.
    button.addEventListener('keydown', addEditor);
    for (let index = 1; index < 3; index++) {
      const result = await handleClickCommand({
        id: `add-${index}`,
        selector: '[data-testid="addButton"]',
      }, SOURCE, { hostname });
      expect(result.ok).toBe(true);
      expect(click).not.toHaveBeenCalled();
      expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(index + 1);
    }
    expect(document.querySelector('[data-testid="tweetTextarea_2"]')).not.toBeNull();
  });

  it('keeps Enter activation for the non-native X add-post control', async () => {
    document.body.innerHTML = '<div role="button" tabindex="0" data-testid="addButton">Add</div>';
    const button = document.querySelector<HTMLElement>('[role="button"]')!;
    const click = vi.spyOn(button, 'click');
    const keys: string[] = [];
    for (const type of ['keydown', 'keypress', 'keyup']) {
      button.addEventListener(type, () => keys.push(type));
    }

    const result = await handleClickCommand({
      id: 'click-2',
      selector: '[role="button"]',
    }, SOURCE, { hostname: 'x.com' });

    expect(result.ok).toBe(true);
    expect(click).not.toHaveBeenCalled();
    expect(keys).toEqual(['keydown', 'keypress', 'keyup']);
  });

  it.each([false, true])('commits the unfocused X editor before Add (native blur=%s)', async (nativeBlur) => {
    document.body.innerHTML = `
      <div data-testid="tweetTextarea_1" contenteditable="true">second chunk</div>
      <button data-testid="addButton">Add</button>
    `;
    const editor = document.querySelector<HTMLElement>('[contenteditable]')!;
    const button = document.querySelector<HTMLButtonElement>('button')!;
    let active: Element = editor;
    vi.spyOn(document, 'activeElement', 'get').mockImplementation(() => active);
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const events: string[] = [];
    for (const type of ['blur', 'focusout']) editor.addEventListener(type, (event) => {
      expect((event as FocusEvent).relatedTarget).toBe(button);
      events.push(type);
    });
    vi.spyOn(button, 'focus').mockImplementation(() => {
      active = button;
      if (nativeBlur) {
        editor.dispatchEvent(new FocusEvent('blur', { relatedTarget: button }));
        editor.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: button }));
      }
    });
    button.addEventListener('keydown', () => events.push('add'));
    const click = vi.spyOn(button, 'click');

    const result = await handleClickCommand({ id: 'hidden-add', selector: 'button' }, SOURCE, { hostname: 'x.com' });

    expect(result.ok).toBe(true);
    expect(events).toEqual(['blur', 'focusout', 'add']);
    expect(click).not.toHaveBeenCalled();
  });

  it('does not blur an unrelated active control when adding an X post', async () => {
    document.body.innerHTML = '<input><button data-testid="addButton">Add</button>';
    const input = document.querySelector('input')!;
    const button = document.querySelector('button')!;
    let active: Element = input;
    vi.spyOn(document, 'activeElement', 'get').mockImplementation(() => active);
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    vi.spyOn(button, 'focus').mockImplementation(() => { active = button; });
    const blur = vi.fn();
    input.addEventListener('focusout', blur);
    await handleClickCommand({ id: 'unrelated', selector: 'button' }, SOURCE, { hostname: 'x.com' });
    expect(blur).not.toHaveBeenCalled();
  });

  it('rejects missing or disabled click targets', async () => {
    document.body.innerHTML = '<button aria-disabled="true">Post</button>';

    await expect(handleClickCommand({
      id: 'click-3',
      selector: 'button, a',
      texts: ['Post'],
    }, SOURCE)).resolves.toEqual({
      source: SOURCE,
      id: 'click-3',
      ok: false,
      error: 'click target not found',
    });
  });
});
