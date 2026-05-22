import { log } from '../src/utils/logger';
import type { ImageAttachment, PostResultMessage } from '../src/messages';
import { BLUESKY_SELECTORS, blueskyAdapter } from '../src/adapters/bluesky';
import { executePostFlow } from '../src/utils/post-flow';
import { sleep } from '../src/utils/dom';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';

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
  log.warn('bluesky: handle 取得失敗。localStorage keys =', debugKeys);
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

/**
 * bsky.app localStorage から ATProto session (accessJwt + did + handle) を抽出。
 * reply chain で API path を使うために必要 (user が Settings に API credentials を
 * 設定してなくても、 bsky.app にログイン済みなら token を借りられる)。
 */
function readBlueskySession(): { accessJwt: string; did: string; handle: string; pdsHost?: string } | null {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !/bsky|agent|session/i.test(k)) continue;
    const v = localStorage.getItem(k);
    if (!v) continue;
    try {
      const parsed = JSON.parse(v);
      let accessJwt: string | undefined, did: string | undefined, handle: string | undefined, pdsHost: string | undefined;
      const walk = (o: unknown, depth = 0): void => {
        if (depth > 6 || !o || typeof o !== 'object') return;
        const obj = o as Record<string, unknown>;
        if (typeof obj.accessJwt === 'string' && !accessJwt) accessJwt = obj.accessJwt;
        if (typeof obj.did === 'string' && /^did:/.test(obj.did) && !did) did = obj.did;
        if (typeof obj.handle === 'string' && !handle) handle = obj.handle;
        if (typeof obj.service === 'string' && /^https?:/.test(obj.service) && !pdsHost) pdsHost = (obj.service as string).replace(/\/$/, '');
        if (typeof obj.pdsHost === 'string' && !pdsHost) pdsHost = obj.pdsHost;
        if (Array.isArray(obj)) for (const x of obj) walk(x, depth + 1);
        else for (const x of Object.values(obj)) walk(x, depth + 1);
      };
      walk(parsed);
      if (accessJwt && did && handle) {
        return { accessJwt, did, handle, ...(pdsHost ? { pdsHost } : {}) };
      }
    } catch { /* not JSON */ }
  }
  return null;
}

export default defineContentScript({
  matches: ['https://bsky.app/*'],
  main: () => bootstrapContentScript({
    platform: 'bluesky',
    selectors: BLUESKY_SELECTORS,
    detectUser: detectBlueskyUser,
    runPost,
    // GET_BLUESKY_SESSION: localStorage から ATProto session JWT を抜き出して
    // background に返す (reply chain で borrowed session を使うため)
    extraHandler: (msg, sendResponse) => {
      if (msg.type !== 'GET_BLUESKY_SESSION') return undefined;
      const sess = readBlueskySession();
      sendResponse(sess ? { type: 'BLUESKY_SESSION_RESULT', ...sess } : null);
      return true;
    },
  }),
});

async function runPost(text: string, images?: ImageAttachment[], dryRun?: boolean): Promise<PostResultMessage> {
  const sel = await resolveSelectors('bluesky', BLUESKY_SELECTORS);
  await executePostFlow({
    prefillsViaUrl: blueskyAdapter.prefillsViaUrl,
    textareaSelector: sel.textarea,
    postButtonSelector: sel.postButton,
    postButtonTexts: ['Publish', 'Post', '投稿', 'Publish post'],
    dropTargetSelector: sel.dropTarget,
    text,
    images,
    dryRun,
  });

  // dryRun でなければ compose modal が閉じる (= post 完了) のを verify。
  // Bluesky は Publish click をトリガに image upload + record create が走るので、
  // click 後 ~ 数秒は modal が開いたままになる。 旧コードは afterClickDelayMs=1500
  // で即 return → 直後に handlePostRequest が次 chunk の URL に tab.update する
  // と、 in-flight の upload を kill して chunk 0 が silent fail
  // ((1/2) 飛ばずに (2/2) のみ投稿される、 user 報告 2026-05-21)。
  if (!dryRun) {
    const stillOpen = () =>
      document.querySelector('[data-testid="composer"]') ||
      document.querySelector('[contenteditable="true"][role="textbox"]');
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (!stillOpen()) break;
      await sleep(300);
    }
    if (stillOpen()) {
      throw new Error(
        'Bluesky: Publish click 後に compose modal が閉じませんでした (画像 upload 失敗 / サイズ超過 / その他エラーの可能性)',
      );
    }
    log.info('Bluesky: post 完了 verify (modal closed)');
  }

  return {
    type: 'POST_RESULT',
    platform: 'bluesky',
    success: true,
  };
}
