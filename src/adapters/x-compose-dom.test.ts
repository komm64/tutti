// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  getXComposeRoot,
  getLiveXMediaComposeRoot,
  getXMediaComposeRoot,
  getXThreadAddPostTarget,
  getXThreadTextarea,
  getXThreadTextareas,
  hasXMediaAttachment,
  readXEditableText,
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

  it('finds a later thread editor in the replacement dialog, not the detached root', () => {
    document.body.innerHTML = `
      <div role="dialog" id="first">
        <div data-testid="tweetTextarea_0" role="textbox"></div>
        <div data-testid="tweetTextarea_1" role="textbox"></div>
      </div>
    `;
    const firstRoot = document.querySelector<HTMLElement>('#first')!;

    firstRoot.remove();
    document.body.innerHTML = `
      <div role="dialog" id="replacement">
        <div data-testid="tweetTextarea_0" role="textbox"></div>
        <div data-testid="tweetTextarea_1" role="textbox"></div>
        <div data-testid="tweetTextarea_2" role="textbox"></div>
      </div>
    `;

    const thirdTextarea = getXThreadTextarea(document, 2, () => true);
    expect(thirdTextarea).toBeDefined();
    expect(getXComposeRoot(thirdTextarea!).id).toBe('replacement');
    expect(firstRoot.isConnected).toBe(false);
  });

  it('requires a visible video inside the current compose root', () => {
    document.body.innerHTML = `
      <div role="dialog" id="current"><video id="attached"></video></div>
      <div role="dialog" id="other"><video id="unrelated"></video></div>
    `;
    const current = document.querySelector<HTMLElement>('#current')!;

    expect(hasXMediaAttachment(current, (element) => element.id === 'attached')).toBe(true);
    expect(hasXMediaAttachment(current, () => false)).toBe(false);
    document.querySelector('#attached')?.remove();
    expect(hasXMediaAttachment(current, () => true)).toBe(false);
  });

  it('accepts the compact attachment container after X replaces the video player', () => {
    const scope = document.createElement('div');
    scope.innerHTML = '<div id="attached" data-testid="attachments"></div>';

    expect(hasXMediaAttachment(scope, (element) => element.id === 'attached')).toBe(true);
    expect(hasXMediaAttachment(scope, () => false)).toBe(false);
  });

  it('selects the attached dialog when X also renders an empty inline composer', () => {
    document.body.innerHTML = `
      <main id="inline">
        <div data-testid="tweetTextarea_0" role="textbox" contenteditable="true"></div>
      </main>
      <div role="dialog" id="attached-dialog">
        <div data-testid="tweetTextarea_0" role="textbox" contenteditable="true">draft</div>
        <div data-testid="attachments"><video></video></div>
      </div>
    `;

    expect(getXMediaComposeRoot(document, () => true)?.id).toBe('attached-dialog');
  });

  it('keeps the attached inline composer when an empty dialog mounts later', () => {
    document.body.innerHTML = `
      <div role="dialog" id="empty-dialog">
        <div data-testid="tweetTextarea_0" role="textbox" contenteditable="true"></div>
        <button data-testid="tweetButton" disabled>Post</button>
      </div>
      <main id="attached-inline">
        <div data-testid="tweetTextarea_0" role="textbox" contenteditable="true"></div>
        <div data-testid="attachments"><img src="blob:test"></div>
        <button data-testid="tweetButtonInline">Post</button>
      </main>
    `;

    expect(getXMediaComposeRoot(document, () => true)?.id).toBe('attached-inline');
  });

  it('selects the matching dialog Add post control when an inline composer was selected first', () => {
    document.body.innerHTML = `
      <main id="inline">
        <div data-testid="tweetTextarea_0" role="textbox" contenteditable="true">first chunk</div>
        <button data-testid="tweetButtonInline" disabled>Post</button>
      </main>
      <div role="dialog" id="unrelated-dialog">
        <div data-testid="tweetTextarea_0" role="textbox" contenteditable="true">other draft</div>
        <button data-testid="addButton" aria-label="Add post"></button>
      </div>
      <div role="dialog" id="matching-dialog">
        <div data-testid="tweetTextarea_0" role="textbox" contenteditable="true">first chunk</div>
        <button data-testid="addButton" aria-label="Add post"></button>
      </div>
    `;

    const target = getXThreadAddPostTarget(
      document,
      'first   chunk',
      () => true,
      () => false,
    );

    expect(target?.button.closest('[role="dialog"]')?.id).toBe('matching-dialog');
    expect(getXComposeRoot(target!.textarea).id).toBe('matching-dialog');
  });

  it('reacquires the live video composer after X detaches the previous root', () => {
    document.body.innerHTML = `
      <div role="dialog" id="previous">
        <div data-testid="tweetTextarea_0" role="textbox"></div>
        <div data-testid="attachments"><video></video></div>
      </div>
    `;
    const previous = document.querySelector<HTMLElement>('#previous')!;

    previous.remove();
    document.body.innerHTML = `
      <div role="dialog" id="replacement">
        <div data-testid="tweetTextarea_0" role="textbox"></div>
        <div data-testid="attachments"><video></video></div>
        <button data-testid="tweetButton">Post</button>
      </div>
    `;

    const live = getLiveXMediaComposeRoot(document, previous, () => true);
    expect(previous.isConnected).toBe(false);
    expect(live?.id).toBe('replacement');
    expect(live?.querySelector('[data-testid="tweetButton"]')).not.toBeNull();
  });

  it('preserves rendered Draft.js block boundaries when reading X text', () => {
    const editor = document.createElement('div');
    editor.innerHTML = '<div>first line</div><div><br></div><div>https://example.com/</div>';
    Object.defineProperty(editor, 'innerText', {
      configurable: true,
      value: 'first line\n\nhttps://example.com/',
    });

    expect(editor.textContent).toBe('first linehttps://example.com/');
    expect(readXEditableText(editor)).toBe('first line\n\nhttps://example.com/');
  });
});
