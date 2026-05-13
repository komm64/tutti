/**
 * scripts/e2e/platforms/<sns>.mjs から共通で使う helpers。
 *
 * 流儀: 各 platform module は run({ ctx, extensionId, debug }) を export し、
 *   {ok: boolean, note?: string, error?: string} を返す。
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function timestampedText(label) {
  return `tutti e2e ${label} ${new Date().toISOString()}`;
}

/**
 * SPA は navigation 直後だと要素が未マウントのことが多い。
 * waitForSelector で 10s タイムアウト付き polling すれば、ログイン済みなのに
 * 「未ログイン」と誤判定する事故を回避できる (実機 2026-05-13)。
 */
export async function ensureLoggedIn(page, selector, label, timeoutMs = 10000) {
  const found = await page.waitForSelector(selector, { timeout: timeoutMs, state: 'attached' })
    .then(() => true)
    .catch(() => false);
  if (!found) {
    return { ok: false, error: `not logged in (${label} — test account session expired?)` };
  }
  return { ok: true };
}

/**
 * Tutti の content script に POST_TO_PLATFORM を直接送る。background の
 * orchestration (popup → POST_REQUEST → openOrFocusTab) は経由しない。
 * pre-opened した tab に content script が auto-inject 済の前提。
 *
 * - urlGlob: chrome.tabs.query で対象タブを引くための glob (例 'https://x.com/*')
 * - platform: adapter id ('x' / 'threads' / ...)
 * - text: 本文
 * - images: ImageAttachment[] (base64 data 形式、optional)
 */
export async function sendPostMessage(ctx, { urlGlob, platform, text, images, autoPost = true }) {
  const sw = ctx.serviceWorkers()[0];
  if (!sw) throw new Error('no service worker');
  return await sw.evaluate(
    async ({ urlGlob, platform, text, images, autoPost }) => {
      const tabs = await chrome.tabs.query({ url: urlGlob });
      const tab = tabs[0];
      if (!tab) return { ok: false, error: `no tab for ${urlGlob}` };
      const result = await chrome.tabs.sendMessage(tab.id, {
        type: 'POST_TO_PLATFORM',
        platform,
        text,
        images: images ?? [],
        autoPost,
      });
      return { ok: result?.success === true, raw: result };
    },
    { urlGlob, platform, text, images: images ?? [], autoPost },
  );
}

/**
 * scripts/e2e/fixtures/ から fixture (画像 / 動画) を読み込んで
 * ImageAttachment 形式 (data: base64) で返す。
 *
 * 存在しない場合 null を返す → 各 module は skip 判断を自分でする。
 */
export async function loadFixture(filename, mimeType, { durationS } = {}) {
  const path = resolve(__dirname, 'fixtures', filename);
  if (!existsSync(path)) return null;
  const bytes = await readFile(path);
  const data = bytes.toString('base64');
  return {
    name: basename(path),
    type: mimeType,
    data,
    bytes: bytes.length,
    ...(durationS !== undefined ? { durationS } : {}),
  };
}
