/**
 * Vitest 用 globalThis.browser mock。
 * registry.ts 等が browser.i18n.getMessage を呼ぶので、 ja messages.json を
 * 読み込んで placeholder 解決まで再現する。 これにより既存テストの
 * 「『画像が多すぎます』 を含むか」 等の string check が i18n 後も通る。
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const messages = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'public', '_locales', 'ja', 'messages.json'), 'utf-8'),
) as Record<string, { message: string; placeholders?: Record<string, { content?: string }> }>;

function getMessage(key: string, subs: string[] = []): string {
  const entry = messages[key];
  if (!entry?.message) return '';
  let msg = entry.message;
  if (entry.placeholders) {
    for (const [pname, pdef] of Object.entries(entry.placeholders)) {
      const m = pdef.content?.match(/\$(\d+)/);
      if (!m || !m[1]) continue;
      const idx = parseInt(m[1], 10) - 1;
      msg = msg.replaceAll('$' + pname + '$', subs[idx] ?? '');
    }
  }
  return msg;
}

(globalThis as { browser?: unknown }).browser = { i18n: { getMessage } };
