// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  getXThreadTextarea,
  getXThreadTextareas,
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
});
