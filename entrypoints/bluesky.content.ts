import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { BLUESKY_SELECTORS, blueskyAdapter } from '../src/adapters/bluesky';
import { executePostFlow } from '../src/utils/post-flow';
import { detectAndReportUser } from '../src/utils/user-detect';

function detectBlueskyUser(): string | null {
  // 戦略 1: localStorage を総当たりで探索(キー名はバージョン依存)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const lc = key.toLowerCase();
      if (!lc.includes('bsky') && !lc.includes('agent') && !lc.includes('session')) continue;
      const val = localStorage.getItem(key);
      if (!val) continue;
      // JSON っぽければ parse して handle っぽいフィールドを総当たり
      try {
        const parsed = JSON.parse(val);
        const handle = findHandleInObject(parsed);
        if (handle) return '@' + handle;
      } catch { /* not JSON, skip */ }
    }
  } catch { /* ignore */ }

  // 戦略 2: aria-label="Profile" の side nav リンク(post 内の profile リンクを除外)
  const navLink = document.querySelector<HTMLAnchorElement>(
    'a[aria-label="Profile"][href^="/profile/"]',
  );
  const m1 = navLink?.getAttribute('href')?.match(/^\/profile\/([^/?#]+)/);
  if (m1 && m1[1]) return '@' + m1[1];

  // 戦略 3: data-testid 系
  const testidLink = document.querySelector<HTMLAnchorElement>(
    '[data-testid="bottomBarProfileBtn"] a, [data-testid="profileHeaderButton"]',
  );
  const m2 = testidLink?.getAttribute('href')?.match(/^\/profile\/([^/?#]+)/);
  if (m2 && m2[1]) return '@' + m2[1];

  // デバッグ: 見つからない場合、関連 localStorage キーを出力
  const debugKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) debugKeys.push(k);
  }
  console.warn('[Tutti] bluesky: handle 取得失敗。localStorage keys =', debugKeys);
  return null;
}

/**
 * オブジェクト内を再帰的に走査して "handle" っぽいキーの値を探す。
 * Bluesky の session 構造は内部実装が変わるので depth-first でフォールバック。
 */
function findHandleInObject(obj: unknown, depth = 0): string | null {
  if (depth > 6 || !obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  // active=true なアカウントを優先
  if (Array.isArray(o)) {
    const active = (o as Record<string, unknown>[]).find((x) => x && (x as { active?: boolean }).active === true);
    if (active && typeof (active as { handle?: unknown }).handle === 'string') {
      return (active as { handle: string }).handle;
    }
  }
  if (typeof o['handle'] === 'string' && /[\w.-]+/.test(o['handle'] as string)) {
    return o['handle'] as string;
  }
  for (const v of Object.values(o)) {
    const found = findHandleInObject(v, depth + 1);
    if (found) return found;
  }
  return null;
}

export default defineContentScript({
  matches: ['https://bsky.app/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'bluesky') return;

      void runPost(msg.text, msg.images, msg.dryRun)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'bluesky',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    void detectAndReportUser('bluesky', detectBlueskyUser);
    console.log('[Tutti] Bluesky content script ready');
  },
});

async function runPost(text: string, images?: ImageAttachment[], dryRun?: boolean): Promise<PostResultMessage> {
  await executePostFlow({
    prefillsViaUrl: blueskyAdapter.prefillsViaUrl,
    textareaSelector: BLUESKY_SELECTORS.textarea,
    postButtonSelector: BLUESKY_SELECTORS.postButton,
    postButtonTexts: ['Publish', 'Post', '投稿', 'Publish post'],
    fileInputSelector: BLUESKY_SELECTORS.fileInput,
    text,
    images,
    dryRun,
  });

  return {
    type: 'POST_RESULT',
    platform: 'bluesky',
    success: true,
  };
}
