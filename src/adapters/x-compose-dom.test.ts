// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  getXComposeRoot,
  getXThreadTextarea,
  getXThreadTextareas,
  hasXVideoAttachment,
} from './x-compose-dom';

describe('X thread compose DOM selection', () => {
  it('ignores X label and rich-text container elements with the same prefix', () => {
    document.body.innerHTML = `
      <div data-testid="tweetTextarea_1_label" role="textbox">label</div>
      <div data-testid="tweetTextarea_1RichTextInputContainer" role="textbox">container</div>
      <div data-testid="tweetTextarea_1" role="textbox" contenteditable="true">actual</div>
    `;

    expect(getXThreadTextareas(document, () => true)).toHaveLength(1);
    expect(getXThreadTextarea(document, 1, () => true)?.textContent).toBe('actual');
  });

  it('uses the X textarea id instead of the current visible array position', () => {
    document.body.innerHTML = `
      <div data-testid="tweetTextarea_1" role="textbox" contenteditable="true">second</div>
    `;

    expect(getXThreadTextarea(document, 0, () => true)).toBeUndefined();
    expect(getXThreadTextarea(document, 1, () => true)?.textContent).toBe('second');
  });

  it('resolves the current dialog again after X remounts the composer', () => {
    document.body.innerHTML = `
      <main>
        <div role="dialog" id="first">
          <div data-testid="tweetTextarea_0" role="textbox"></div>
        </div>
      </main>
    `;
    const firstTextarea = document.querySelector<HTMLElement>('[data-testid="tweetTextarea_0"]')!;
    const firstRoot = getXComposeRoot(firstTextarea);

    document.querySelector('#first')?.remove();
    document.querySelector('main')!.innerHTML = `
      <div role="dialog" id="second">
        <div data-testid="tweetTextarea_0" role="textbox"></div>
      </div>
    `;
    const secondTextarea = document.querySelector<HTMLElement>('[data-testid="tweetTextarea_0"]')!;

    expect(firstRoot.id).toBe('first');
    expect(firstRoot.isConnected).toBe(false);
    expect(getXComposeRoot(secondTextarea).id).toBe('second');
  });

  it('requires a visible video inside the current compose root', () => {
    document.body.innerHTML = `
      <div role="dialog" id="current"><video id="attached"></video></div>
      <div role="dialog" id="other"><video id="unrelated"></video></div>
    `;
    const current = document.querySelector<HTMLElement>('#current')!;

    expect(hasXVideoAttachment(current, (element) => element.id === 'attached')).toBe(true);
    expect(hasXVideoAttachment(current, () => false)).toBe(false);
    document.querySelector('#attached')?.remove();
    expect(hasXVideoAttachment(current, () => true)).toBe(false);
  });
});
