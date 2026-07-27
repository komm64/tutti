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

  it('uses Enter events for the X add-post control', async () => {
    document.body.innerHTML = '<button data-testid="addButton">Add</button>';
    const button = document.querySelector<HTMLButtonElement>('button')!;
    const click = vi.spyOn(button, 'click');
    const keys: string[] = [];
    for (const type of ['keydown', 'keypress', 'keyup']) {
      button.addEventListener(type, () => keys.push(type));
    }

    const result = await handleClickCommand({
      id: 'click-2',
      selector: 'button',
    }, SOURCE, { hostname: 'x.com' });

    expect(result.ok).toBe(true);
    expect(click).not.toHaveBeenCalled();
    expect(keys).toEqual(['keydown', 'keypress', 'keyup']);
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
