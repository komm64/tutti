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

export interface WaitForStableConditionOptions extends WaitForConditionOptions {
  /** 同じ候補がこの時間維持されたら安定とみなす。 */
  quietMs: number;
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
 * 条件が一度成立しただけでは進まず、同じ候補が quietMs 維持された時点で返す。
 * React / Lexical が input や wizard page を遅れて差し替えるケース向け。
 *
 * DOM mutation時は waitForCondition の MutationObserver callbackから即再評価し、
 * intervalはproperty変化とquiet window満了を拾うfallbackとしてだけ使う。
 */
export function waitForStableCondition<T>(
  predicate: () => T | null | undefined | false,
  options: WaitForStableConditionOptions,
  identity: (value: T) => unknown = (value) => value,
): Promise<T | null> {
  let candidateIdentity: unknown;
  let candidateSince: number | undefined;

  return waitForCondition<T>(() => {
    const candidate = predicate();
    if (!candidate) {
      candidateIdentity = undefined;
      candidateSince = undefined;
      return null;
    }

    const nextIdentity = identity(candidate);
    if (candidateSince === undefined || nextIdentity !== candidateIdentity) {
      candidateIdentity = nextIdentity;
      candidateSince = Date.now();
      return null;
    }
    return Date.now() - candidateSince >= options.quietMs
      ? candidate
      : null;
  }, options);
}

export function readEditableText(element: Element | null | undefined): string {
  if (!element) return '';
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element.value;
  }
  return element.textContent ?? '';
}

export function normalizedEditableText(element: Element | null | undefined): string {
  return normalizeElementText(readEditableText(element));
}

export function waitForStableEditableText(
  selector: string,
  expectedText: string,
  options: Partial<WaitForStableConditionOptions> = {},
): Promise<HTMLElement | null> {
  const expected = normalizeElementText(expectedText);
  return waitForStableCondition<HTMLElement>(
    () => {
      const element = document.querySelector<HTMLElement>(selector);
      return element && normalizedEditableText(element) === expected
        ? element
        : null;
    },
    {
      timeoutMs: options.timeoutMs ?? 1_000,
      quietMs: options.quietMs ?? 150,
      intervalMs: options.intervalMs ?? 50,
      root: options.root ?? document.body,
      observerInit: options.observerInit,
    },
  );
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
