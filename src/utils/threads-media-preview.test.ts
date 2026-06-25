import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { findThreadsMediaRejection, hasThreadsMediaPreview } from './threads-media-preview';

describe('threads media preview detection', () => {
  it('detects a blob image preview in the compose dialog', () => {
    const doc = createDocument();
    doc.body.innerHTML = `
      <div role="dialog">
        <div role="textbox" contenteditable="true"></div>
        <img src="blob:https://www.threads.com/media-preview">
      </div>
    `;
    markVisible(doc.querySelector<HTMLElement>('[role="dialog"]')!, 600, 500);
    markVisible(doc.querySelector<HTMLElement>('img')!, 320, 240);

    expect(hasThreadsMediaPreview(doc)).toBe(true);
  });

  it('does not treat a profile avatar as an attached media preview', () => {
    const doc = createDocument();
    doc.body.innerHTML = `
      <div role="dialog">
        <div role="textbox" contenteditable="true"></div>
        <a href="/@ren"><img src="https://scontent.example/avatar.jpg" alt="Ren profile picture"></a>
      </div>
    `;
    markVisible(doc.querySelector<HTMLElement>('[role="dialog"]')!, 600, 500);
    markVisible(doc.querySelector<HTMLElement>('img')!, 96, 96);

    expect(hasThreadsMediaPreview(doc)).toBe(false);
  });

  it('finds media rejection text in the compose dialog', () => {
    const doc = createDocument();
    doc.body.innerHTML = `
      <div role="dialog">
        <div role="textbox" contenteditable="true"></div>
        <div role="alert">Could not upload this file format.</div>
      </div>
    `;
    markVisible(doc.querySelector<HTMLElement>('[role="dialog"]')!, 600, 500);
    markVisible(doc.querySelector<HTMLElement>('[role="alert"]')!, 280, 40);

    expect(findThreadsMediaRejection(doc)).toContain('Could not upload');
  });
});

function createDocument(): Document {
  return new Window().document as unknown as Document;
}

function markVisible(el: HTMLElement, width: number, height: number): void {
  const rect = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  };
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  });
  Object.defineProperty(el, 'getClientRects', {
    configurable: true,
    value: () => [rect],
  });
}
