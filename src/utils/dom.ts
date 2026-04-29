/**
 * 指定セレクタの要素が出現するまで待機(MutationObserver で監視、timeout で諦める)。
 * SPA で React が描画する DOM に対して安全にアクセスするための基本ユーティリティ。
 */
export function waitForElement<T extends Element = HTMLElement>(
  selector: string,
  timeoutMs = 5000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector<T>(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const found = document.querySelector<T>(selector);
      if (found) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(found);
      }
    });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 指定テキストを持つ button / [role="button"] 要素を探す。
 * 同じテキストの候補が複数あれば最後のもの(dialog 最下部の submit である可能性が高い)を返す。
 */
export function findClickableByText(text: string | string[]): HTMLElement | null {
  const texts = Array.isArray(text) ? text : [text];
  const candidates = document.querySelectorAll<HTMLElement>('button, [role="button"]');
  let lastMatch: HTMLElement | null = null;
  for (const el of candidates) {
    const t = el.textContent?.trim();
    if (t && texts.includes(t)) lastMatch = el;
  }
  return lastMatch;
}

/**
 * contenteditable な要素にテキストを挿入する(React 制御下でも反応するように)。
 * execCommand は deprecated だが、X / Bluesky 等の React 製 contenteditable で
 * 最も確実に input イベントを発火させる手段として現状残っている。
 */
export function insertTextIntoContentEditable(
  el: HTMLElement,
  text: string,
): void {
  el.focus();
  const selection = document.getSelection();
  if (selection) {
    selection.selectAllChildren(el);
    selection.deleteFromDocument();
  }
  document.execCommand('insertText', false, text);
}
