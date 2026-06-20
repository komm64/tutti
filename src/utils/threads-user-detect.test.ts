import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { detectThreadsUserFromDocument } from './threads-user-detect';

function doc(html: string): Document {
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document as unknown as Document;
}

describe('detectThreadsUserFromDocument', () => {
  it('detects a profile link exposed by aria-label', () => {
    expect(detectThreadsUserFromDocument(doc('<a aria-label="Profile" href="/@komm64"></a>'))).toBe('@komm64');
  });

  it('detects a profile avatar link', () => {
    expect(detectThreadsUserFromDocument(doc('<nav><a href="/@komm64"><img alt="avatar"></a></nav>'))).toBe('@komm64');
  });

  it('uses navigation links as a conservative fallback', () => {
    expect(detectThreadsUserFromDocument(doc('<nav><a href="/@komm64"><span>Profile</span></a></nav>'))).toBe('@komm64');
  });

  it('does not treat arbitrary non-navigation profile links as the active account', () => {
    expect(detectThreadsUserFromDocument(doc(`
      <main>
        <a href="/@someone-else"><span>Someone Else</span></a>
      </main>
    `))).toBeNull();
  });

  it('does not treat arbitrary avatar links as the active account', () => {
    expect(detectThreadsUserFromDocument(doc(`
      <main>
        <a href="/@someone-else"><img alt="avatar"></a>
      </main>
    `))).toBeNull();
  });
});
