import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { TUMBLR_SELECTORS } from '../adapters/tumblr';
import {
  findTumblrBodyBlocks,
  readTumblrBodyText,
} from './tumblr-editor';

function makeDocument(html: string): Document {
  const window = new Window();
  window.document.documentElement.innerHTML = html;
  return window.document as unknown as Document;
}

describe('Tumblr editor body helpers', () => {
  it('reads the classic Gutenberg paragraph body and ignores the title', () => {
    const doc = makeDocument(`
      <body>
        <div role="dialog" aria-label="New post">
          <div data-testid="gutenberg-editor">
            <h1 contenteditable="true">Title</h1>
            <p contenteditable="true">Current draft</p>
          </div>
        </div>
      </body>
    `);

    expect(readTumblrBodyText(TUMBLR_SELECTORS.textarea, { root: doc })).toBe('Current draft');
  });

  it('reads remounted non-p body blocks and ignores media captions', () => {
    const doc = makeDocument(`
      <body>
        <div role="dialog" aria-label="New post">
          <div data-testid="gutenberg-editor">
            <h1 contenteditable="true">Title</h1>
            <figure data-block-type="image">
              <p contenteditable="true" aria-label="Image caption">not the post body</p>
            </figure>
            <div
              class="block-editor-rich-text__editable"
              role="document"
              contenteditable="true"
            >Current draft after image attach</div>
            <div aria-label="Tags editor">
              <p contenteditable="true">tag input text</p>
            </div>
          </div>
        </div>
      </body>
    `);

    expect(readTumblrBodyText(TUMBLR_SELECTORS.textarea, { root: doc }))
      .toBe('Current draft after image attach');
  });

  it('does not read from a detached pre-remount editor scope', () => {
    const doc = makeDocument(`
      <body>
        <div role="dialog" aria-label="New post">
          <div data-testid="gutenberg-editor">
            <div role="document" contenteditable="true">Current connected draft</div>
          </div>
        </div>
      </body>
    `);
    const staleEditor = doc.createElement('div');
    staleEditor.setAttribute('data-testid', 'gutenberg-editor');
    staleEditor.innerHTML = '<p contenteditable="true">stale detached draft</p>';
    const staleBlock = staleEditor.querySelector('p');

    expect(staleBlock?.isConnected).toBe(false);
    expect(readTumblrBodyText(TUMBLR_SELECTORS.textarea, { root: doc, anchor: staleBlock }))
      .toBe('Current connected draft');
  });

  it('returns only post body candidates as injection targets', () => {
    const doc = makeDocument(`
      <body>
        <div role="dialog" aria-label="New post">
          <div data-testid="gutenberg-editor">
            <h1 contenteditable="true">Title</h1>
            <div data-type="tumblr/image"><p contenteditable="true">caption</p></div>
            <p contenteditable="true">Body</p>
          </div>
        </div>
      </body>
    `);

    const blocks = findTumblrBodyBlocks(TUMBLR_SELECTORS.textarea, { root: doc });
    expect(blocks.map((block) => block.textContent?.trim())).toEqual(['Body']);
  });
});
