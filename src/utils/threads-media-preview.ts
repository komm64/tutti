export function hasThreadsMediaPreview(doc: Document = document): boolean {
  return findThreadsComposeScopes(doc).some((scope) => (
    Array.from(scope.querySelectorAll<HTMLElement>('video, canvas, img, [style]'))
      .some(isLikelyThreadsMediaPreview)
  ));
}

export function findThreadsMediaRejection(doc: Document = document): string | undefined {
  for (const scope of findThreadsComposeScopes(doc)) {
    const selectors = [
      '[role="alert"]',
      '[aria-live]',
      '[data-testid*="toast" i]',
      '[data-testid*="error" i]',
      '[class*="toast" i]',
      '[class*="error" i]',
      '[class*="notice" i]',
      '[class*="banner" i]',
    ].join(',');
    const candidates = Array.from(scope.querySelectorAll<HTMLElement>(selectors));
    for (const el of candidates) {
      if (!isVisibleElement(el)) continue;
      const text = (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (isThreadsMediaRejectionText(text)) return text.slice(0, 220);
    }
    const scopeText = visibleTextWithoutEditable(scope);
    if (scopeText && scopeText.length < 4000 && isThreadsMediaRejectionText(scopeText)) {
      return scopeText.slice(0, 220);
    }
  }
  return undefined;
}

function findThreadsComposeScopes(doc: Document): HTMLElement[] {
  const dialogs = Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'))
    .filter((dialog) => isVisibleElement(dialog) && isThreadsComposeScope(dialog));
  if (dialogs.length > 0) return dialogs;

  const main = doc.querySelector<HTMLElement>('main');
  if (main && isThreadsComposeScope(main)) return [main];
  return [];
}

function isThreadsComposeScope(scope: HTMLElement): boolean {
  return !!scope.querySelector(
    'div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"], input[type="file"]',
  );
}

function isLikelyThreadsMediaPreview(el: HTMLElement): boolean {
  if (!isVisibleElement(el)) return false;
  if (isAvatarish(el)) return false;

  const tag = el.tagName.toLowerCase();
  if (tag === 'video' || tag === 'canvas') return true;
  if (tag === 'img') return isLikelyThreadsAttachmentImage(el as HTMLImageElement);

  const background = getComputedStyleSafe(el)?.backgroundImage ?? '';
  if (!/url\(["']?(?:blob:|data:image|https?:\/\/)/i.test(background)) return false;
  const rect = el.getBoundingClientRect();
  return rect.width >= 80 && rect.height >= 80;
}

function isLikelyThreadsAttachmentImage(img: HTMLImageElement): boolean {
  const rect = img.getBoundingClientRect();
  const src = img.currentSrc || img.src || img.getAttribute('src') || '';
  if (/^(blob:|data:image)/i.test(src)) return rect.width >= 40 && rect.height >= 40;
  if (isProfileLinkImage(img) && rect.width <= 120 && rect.height <= 120) return false;
  return rect.width >= 80 && rect.height >= 80;
}

function isAvatarish(el: HTMLElement): boolean {
  const text = [
    el.getAttribute('alt'),
    el.getAttribute('aria-label'),
    el.getAttribute('data-testid'),
    el.getAttribute('class'),
    el.getAttribute('src'),
  ].filter(Boolean).join(' ').toLowerCase();
  return /profile|avatar|profile_pic|user avatar|プロフィール/.test(text);
}

function isProfileLinkImage(el: HTMLElement): boolean {
  const link = el.closest<HTMLAnchorElement>('a[href*="/@"]');
  return !!link;
}

function isVisibleElement(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyleSafe(el);
  return rect.width > 4 &&
    rect.height > 4 &&
    el.getClientRects().length > 0 &&
    style?.display !== 'none' &&
    style?.visibility !== 'hidden' &&
    style?.opacity !== '0';
}

function getComputedStyleSafe(el: HTMLElement): CSSStyleDeclaration | undefined {
  return el.ownerDocument.defaultView?.getComputedStyle(el);
}

function isThreadsMediaRejectionText(text: string): boolean {
  if (!text) return false;
  return /unsupported|not supported|can't upload|cannot upload|could not upload|couldn't upload|failed to upload|file type|file format|format .*not|could not process|couldn't process/i.test(text) ||
    /対応していません|サポートされていません|アップロードできません|処理できません|扱えません|ファイル形式/.test(text);
}

function visibleTextWithoutEditable(scope: HTMLElement): string {
  const clone = scope.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('textarea,input,[contenteditable="true"],[contenteditable="plaintext-only"]').forEach((el) => el.remove());
  return (clone.innerText ?? clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}
