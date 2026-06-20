import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { isMisskeyComposePresent, isMisskeySignInRequiredPage } from './misskey-page-state';

function doc(html: string): Document {
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document as unknown as Document;
}

describe('misskey page state', () => {
  it('detects the Misskey share login-required page', () => {
    const document = doc(`
      <main>
        <h1>ログイン</h1>
        <p>続行する前に、登録またはログインが必要です</p>
      </main>
    `);

    expect(isMisskeySignInRequiredPage(document)).toBe(true);
  });

  it('does not treat a loaded compose form as login-required', () => {
    const document = doc(`
      <form>
        <textarea data-cy-post-form-text></textarea>
        <button data-cy-post-form-submit type="submit">Note</button>
      </form>
    `);

    expect(isMisskeyComposePresent(document)).toBe(true);
    expect(isMisskeySignInRequiredPage(document)).toBe(false);
  });

  it('does not treat a neutral loading shell as login-required', () => {
    const document = doc('<main><p>Loading...</p></main>');

    expect(isMisskeyComposePresent(document)).toBe(false);
    expect(isMisskeySignInRequiredPage(document)).toBe(false);
  });
});
