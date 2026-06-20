import { MISSKEY_SELECTORS } from '../adapters/misskey';

type MisskeyComposeSelectors = Pick<typeof MISSKEY_SELECTORS, 'textarea' | 'postButton'>;

const SIGN_IN_REQUIRED_PATTERNS = [
  /登録またはログインが必要/,
  /ログイン(?:が)?必要/,
  /ログインしてください/,
  /サインイン(?:が)?必要/,
  /you need to (?:sign in|log in)/i,
  /(?:sign in|log in) required/i,
  /(?:sign in|log in) to continue/i,
  /continue.*(?:sign in|log in)/i,
  /register or (?:sign in|log in)/i,
];

export function isMisskeyComposePresent(
  doc: Pick<Document, 'querySelector'>,
  selectors: MisskeyComposeSelectors = MISSKEY_SELECTORS,
): boolean {
  return querySelectorExists(doc, selectors.textarea) || querySelectorExists(doc, selectors.postButton);
}

export function isMisskeySignInRequiredPage(
  doc: Pick<Document, 'body' | 'querySelector'>,
  selectors: MisskeyComposeSelectors = MISSKEY_SELECTORS,
): boolean {
  if (isMisskeyComposePresent(doc, selectors)) return false;
  const text = normalizeDocumentText(doc);
  return SIGN_IN_REQUIRED_PATTERNS.some((pattern) => pattern.test(text));
}

function querySelectorExists(doc: Pick<Document, 'querySelector'>, selector: string): boolean {
  try {
    return !!doc.querySelector(selector);
  } catch {
    return false;
  }
}

function normalizeDocumentText(doc: Pick<Document, 'body'>): string {
  const body = doc.body as HTMLElement | null | undefined;
  return (body?.innerText ?? body?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
