/**
 * 指定セレクタの要素が出現するまで待機(MutationObserver で監視、timeout で諦める)。
 * SPA で React が描画する DOM に対して安全にアクセスするための基本ユーティリティ。
 */
export function waitForElement<T extends Element = HTMLElement>(
  selector: string,
  timeoutMs = 5000,
): Promise<T | null> {
  return waitForCondition<T>(
    () => document.querySelector<T>(selector),
    {
      timeoutMs,
      root: document.body,
      observerInit: {
        childList: true,
        subtree: true,
        attributes: true,
      },
    },
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WaitForConditionOptions {
  timeoutMs: number;
  intervalMs?: number;
  root?: ParentNode | null;
  observerInit?: MutationObserverInit | false;
}

/**
 * 条件が成立するまで待つ。DOM変化があれば即チェックし、DOM変化が起きない
 * 状態変化(value/property/location等)も取りこぼさないよう短いintervalでも見る。
 * timeoutMs は永久待ちを避けるための上限で、条件成立時は即resolveする。
 */
export function waitForCondition<T>(
  predicate: () => T | null | undefined | false,
  {
    timeoutMs,
    intervalMs = 150,
    root = typeof document !== 'undefined' ? document.body : null,
    observerInit = {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    },
  }: WaitForConditionOptions,
): Promise<T | null> {
  const existing = predicate();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    let done = false;
    let observer: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;

    const finish = (value: T | null): void => {
      if (done) return;
      done = true;
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
      resolve(value);
    };
    const fail = (err: unknown): void => {
      if (done) return;
      done = true;
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
      reject(err);
    };

    const check = (): void => {
      if (done) return;
      try {
        const value = predicate();
        if (value) finish(value);
      } catch (err) {
        fail(err);
      }
    };

    if (
      observerInit !== false &&
      root &&
      typeof MutationObserver !== 'undefined'
    ) {
      observer = new MutationObserver(check);
      observer.observe(root, observerInit);
    }

    interval = setInterval(check, intervalMs);
    timer = setTimeout(() => finish(null), timeoutMs);
    check();
  });
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
    if (elementTextMatches(el, texts)) lastMatch = el;
  }
  return lastMatch;
}

export function normalizeElementText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

export function elementTextMatches(el: HTMLElement, texts: readonly string[]): boolean {
  const visibleText = normalizeElementText(el.textContent);
  if (visibleText && texts.includes(visibleText)) return true;
  const aria = normalizeElementText(el.getAttribute('aria-label'));
  return !!aria && texts.includes(aria);
}

export function isVisibleElement(el: HTMLElement): boolean {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return true;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) return false;
  return true;
}

export function isElementDisabled(el: HTMLElement): boolean {
  return el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled === true;
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
