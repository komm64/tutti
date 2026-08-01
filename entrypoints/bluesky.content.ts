import { log } from '../src/utils/logger';
import type {
  ImageAttachment,
  PostImplementationPath,
  PostResultMessage,
} from '../src/messages';
import { BLUESKY_EDITOR_SELECTOR, BLUESKY_SELECTORS, blueskyAdapter } from '../src/adapters/bluesky';
import { executePostFlow, resolvePostButtonTimeoutMs } from '../src/utils/post-flow';
import {
  sleep,
  waitForCondition,
  waitForElement,
  waitForStableEditableText,
} from '../src/utils/dom';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';
import { clickElementInMainWorld, dropImages, injectImages, injectTextIntoElement } from '../src/utils/image';
import { t } from '../src/utils/i18n';
import { markPostSubmissionStarted } from '../src/utils/post-submission-state';
import { clickElementWithPacing, waitForWebActionPacing } from '../src/utils/web-action-pacing';

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
/**
 * v0.4.94: Bluesky compose modal の inline thread を組み立てる。
 *
 * UI flow:
 *   1. compose modal が開いてる前提 (prefillsViaUrl=true、 /intent/compose 経由で 既に open)
 *   2. 最初の textarea に chunk 0 を inject + image drop
 *   3. 「Add post」 button (Bluesky compose modal の "+" / "次のポストを追加" 等) を click
 *   4. 新 textarea に chunk 1 を inject。 繰り返し
 *   5. Publish button を click (preview なら highlight)
 *
 * Bluesky の inline thread 用 button selector は data-testid を最優先、 aria-label
 * 系を fallback。 UI 変更時は selectors.json で override。
 */
async function executeBlueskyInlineThread(
  sel: typeof BLUESKY_SELECTORS,
  chunks: string[],
  images: ImageAttachment[] | undefined,
  dryRun: boolean | undefined,
  implementationPath: PostImplementationPath | undefined,
): Promise<void> {
  const hasVideo = !!images?.some((image) => image.type.startsWith('video/'));
  // 最初の textarea の wait (compose modal のロード待ち)
  const textarea0 = await waitForElement<HTMLElement>(sel.textarea, 8000);
  if (!textarea0) throw new Error(t('runtimeBlueskyFirstTextareaMissing'));

  // /intent/compose?text= で chunk 0 は通常 prefill 済み。再注入すると TipTap が
  // 既存本文へ追記して重複するため、空または不一致の場合だけ補完する。
  const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();
  if (implementationPath === 'next') {
    await waitForStableEditableText(sel.textarea, chunks[0]!, {
      timeoutMs: 300,
      quietMs: 75,
      intervalMs: 25,
    });
  } else {
    await sleep(300);
  }
  const currentTextarea0 =
    document.querySelector<HTMLElement>(sel.textarea) ?? textarea0;
  if (
    normalizeText(currentTextarea0.textContent ?? '') !==
    normalizeText(chunks[0]!)
  ) {
    await injectTextIntoElement(chunks[0]!, sel.textarea);
  }
  if (implementationPath === 'next') {
    await waitForStableEditableText(sel.textarea, chunks[0]!, {
      timeoutMs: 500,
      quietMs: 100,
      intervalMs: 25,
    });
  } else {
    await sleep(500);
  }

  // images は最初の chunk にだけ attach
  if (images && images.length > 0) {
    await attachBlueskyMedia(
      images,
      sel,
      hasVideo,
      implementationPath,
    );
  }

  // 各 chunk を 「+」 click → wait → inject の繰り返し
  for (let i = 1; i < chunks.length; i++) {
    const addBtn = findBlueskyAddPostButton();
    if (!addBtn) {
      throw new Error(t('runtimeBlueskyAddButtonMissing', i + 1, chunks.length, i));
    }
    await clickElementWithPacing(addBtn);

    const target = await waitForBlueskyThreadTextarea(i, 5000);
    if (!target) {
      const got = document.querySelectorAll(BLUESKY_EDITOR_SELECTOR).length;
      throw new Error(t('runtimeBlueskyTextareaTimeout', i + 1, chunks.length, i + 1, got));
    }
    const marker = `tutti-bsky-chunk-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    target.setAttribute('data-tutti-marker', marker);
    await injectTextIntoElement(chunks[i]!, `[data-tutti-marker="${marker}"]`);
    if (implementationPath === 'next') {
      await waitForStableEditableText(
        `[data-tutti-marker="${marker}"]`,
        chunks[i]!,
        {
          timeoutMs: 300,
          quietMs: 75,
          intervalMs: 25,
        },
      );
    } else {
      await sleep(300);
    }
  }

  // Post button (preview なら highlight、 autoPost なら click)
  const findButton = (): HTMLElement | null => {
    for (const p of sel.postButton.split(',').map((s) => s.trim()).filter(Boolean)) {
      const el = document.querySelector<HTMLElement>(p);
      if (el && !(el as HTMLButtonElement).disabled) return el;
    }
    for (const el of document.querySelectorAll<HTMLElement>('button, [role="button"]')) {
      const text = (el.textContent ?? '').trim();
      if (/^Publish( all| post)?$|^投稿$|^Post( all)?$/.test(text) && !(el as HTMLButtonElement).disabled) {
        return el;
      }
    }
    return null;
  };
  const postBtn = await waitForCondition<HTMLElement>(findButton, {
    timeoutMs: resolvePostButtonTimeoutMs(30000, hasVideo),
    intervalMs: 300,
  });
  if (!postBtn) throw new Error(t('runtimeBlueskyPublishButtonMissing'));

  if (dryRun) {
    const orig = postBtn.style.outline;
    postBtn.style.outline = '3px dashed #f59e0b';
    setTimeout(() => { postBtn!.style.outline = orig; }, 5000);
    return;
  }
  await waitForWebActionPacing('submit');
  const livePostBtn = await waitForCondition<HTMLElement>(findButton, {
    timeoutMs: 5000,
    intervalMs: 150,
  });
  if (!livePostBtn) throw new Error(t('runtimeBlueskyPublishButtonMissing'));
  markPostSubmissionStarted();
  livePostBtn.click();

  // modal close 待ち (Bluesky の post 完了 verify)
  const stillOpen = () =>
    document.querySelector('[data-testid="composer"]') ||
    document.querySelector(BLUESKY_EDITOR_SELECTOR);
  const closed = await waitForCondition<boolean>(() => stillOpen() ? null : true, {
    timeoutMs: 30_000,
    intervalMs: 300,
  });
  if (!closed) {
    throw new Error(t('runtimeBlueskyThreadModalOpen'));
  }
}

/** Bluesky の 「次のポストを追加 (+)」 button 候補を多段 fallback で探す。 */
function findBlueskyAddPostButton(): HTMLElement | null {
  // Bluesky 2026-05 実機 probe: aria-label="Add another post to thread"
  // testid は無し、 class は r-* で stable な hook 無し → aria-label match
  const ariaPatterns = [/add another post to thread/i, /add (post|tweet)/i, /ポストを追加/, /次のポスト/];
  for (const el of document.querySelectorAll<HTMLElement>('button, [role="button"]')) {
    const aria = el.getAttribute('aria-label') ?? '';
    if (ariaPatterns.some((p) => p.test(aria)) && !(el as HTMLButtonElement).disabled) return el;
  }
  return null;
}

function waitForBlueskyThreadTextarea(index: number, timeoutMs: number): Promise<HTMLElement | null> {
  return waitForCondition<HTMLElement>(
    () => Array.from(document.querySelectorAll<HTMLElement>(BLUESKY_EDITOR_SELECTOR))[index],
    {
      timeoutMs,
      intervalMs: 150,
      observerInit: {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      },
    },
  );
}

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

async function runPost(
  text: string,
  images?: ImageAttachment[],
  dryRun?: boolean,
  textChunks?: string[],
  implementationPath?: PostImplementationPath,
): Promise<PostResultMessage> {
  const sel = await resolveSelectors('bluesky', BLUESKY_SELECTORS);
  const hasVideo = !!images?.some((image) => image.type.startsWith('video/'));
  log.info(`Bluesky runPost: dryRun=${dryRun} media=${images?.length ?? 0} video=${hasVideo}`);

  // v0.4.94: textChunks > 1 のとき Bluesky の inline thread compose UI を使う。
  // compose modal の 「+」 button で reply block を追加して、 全 chunks を 1 click
  // で thread 投稿する。
  if (textChunks && textChunks.length > 1) {
    await executeBlueskyInlineThread(
      sel,
      textChunks,
      images,
      dryRun,
      implementationPath,
    );
  } else {
    if (images && images.length > 0) {
      await attachBlueskyMedia(
        images,
        sel,
        hasVideo,
        implementationPath,
      );
    }
    await executePostFlow({
      prefillsViaUrl: blueskyAdapter.prefillsViaUrl,
      textareaSelector: sel.textarea,
      postButtonSelector: sel.postButton,
      postButtonTexts: ['Publish', 'Post', '投稿', 'Publish post'],
      text,
      dryRun,
      implementationPath,
      beforeSubmit: hasVideo ? assertBlueskyVideoAttached : undefined,
      clickPostButton: () => clickElementInMainWorld(sel.postButton),
    });
  }

  // dryRun でなければ compose modal が閉じる (= post 完了) のを verify。
  // Bluesky は Publish click をトリガに image upload + record create が走るので、
  // click 後 ~ 数秒は modal が開いたままになる。 旧コードは afterClickDelayMs=1500
  // で即 return → 直後に handlePostRequest が次 chunk の URL に tab.update する
  // と、 in-flight の upload を kill して chunk 0 が silent fail
  // ((1/2) 飛ばずに (2/2) のみ投稿される、 user 報告 2026-05-21)。
  if (!dryRun) {
    const stillOpen = () =>
      document.querySelector('[data-testid="composer"]') ||
      document.querySelector(BLUESKY_EDITOR_SELECTOR);
    const closedQuickly = await waitForCondition<boolean>(() => stillOpen() ? null : true, {
      timeoutMs: 10_000,
      intervalMs: 300,
    });
    if (!closedQuickly) {
      void browser.runtime.sendMessage({
        type: 'USER_ACTION_REQUIRED',
        platform: 'bluesky',
        reason: 'confirmation',
      }).catch(() => { /* background unavailable: compose remains visible */ });
    }
    const closedEventually = closedQuickly || await waitForCondition<boolean>(() => stillOpen() ? null : true, {
      timeoutMs: 5 * 60_000,
      intervalMs: 1000,
    });
    if (!closedEventually) {
      throw new Error(t('runtimeBlueskyConfirmationTimeout'));
    }
    log.info('Bluesky: post 完了 verify (modal closed)');
  }

  // v0.5.8〜 DOM 経路でも post URL を取得する。 Bluesky は localStorage に session
  // を持つので、 そこから accessJwt を取り出して getAuthorFeed で latest を引く。
  // dryRun 時は scrape しない。
  let url: string | undefined;
  if (!dryRun) {
    url = await fetchBlueskyRecentPostUrl(text);
  }

  return {
    type: 'POST_RESULT',
    platform: 'bluesky',
    success: true,
    confirmed: true,
    url,
  };
}

async function attachBlueskyMedia(
  images: ImageAttachment[],
  sel: typeof BLUESKY_SELECTORS,
  hasVideo: boolean,
  implementationPath?: PostImplementationPath,
): Promise<void> {
  const order: Array<'input' | 'drop'> = hasVideo ? ['input', 'drop'] : ['drop', 'input'];
  let lastError: unknown;

  for (const strategy of order) {
    try {
      log.info(`Bluesky: media attach via ${strategy} start (files=${images.length}, video=${hasVideo})`);
      if (strategy === 'input') {
        await injectImages(images, sel.fileInput, {
          requireVideoAccepted: hasVideo ? false : undefined,
          requireMediaAccepted: hasVideo ? false : undefined,
          implementationPath,
        });
      } else {
        await dropImages(images, sel.dropTarget, {
          requireVideoAccepted: hasVideo ? false : undefined,
          requireMediaAccepted: hasVideo ? false : undefined,
          beforeDropDelayMs: hasVideo ? 500 : undefined,
          implementationPath,
        });
      }
      if (hasVideo) await assertBlueskyVideoAttached(30_000);
      log.info(`Bluesky: media attach via ${strategy} accepted`);
      return;
    } catch (e) {
      lastError = e;
      const message = e instanceof Error ? e.message : String(e);
      log.warn(`Bluesky: media attach via ${strategy} failed: ${message}`);
      if (hasVideo && hasBlueskyMediaPreview()) {
        log.warn(`Bluesky: media preview detected after ${strategy} failure; continuing`);
        return;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? t('runtimeImageAttachFailed')));
}

async function assertBlueskyVideoAttached(timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rejection = findBlueskyMediaRejection();
    if (rejection) throw new Error(`Bluesky rejected the video: ${rejection}`);
    if (hasBlueskyMediaPreview()) return;
    await sleep(150);
  }
  throw new Error('Bluesky video attachment was not accepted; refusing to publish text-only.');
}

function blueskyComposerScopes(): ParentNode[] {
  const scopes = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="composer"], [role="dialog"]'));
  return scopes.length > 0 ? scopes : [document.body];
}

function hasBlueskyMediaPreview(): boolean {
  for (const scope of blueskyComposerScopes()) {
    const scopeText = scope instanceof HTMLElement ? visibleTextWithoutEditable(scope) : '';
    if (/(uploading|processing).{0,20}video|video.{0,20}(uploading|processing)|動画.{0,20}(アップロード|処理)|アップロード中|処理中/i.test(scopeText)) {
      return true;
    }
    const candidates = Array.from(scope.querySelectorAll<HTMLElement>([
      'video',
      'canvas',
      'img[src^="blob:"]',
      'img[src^="data:"]',
      '[aria-label*="video" i]',
      '[aria-label*="media" i]',
      '[aria-label*="Remove" i]',
      '[aria-label*="削除"]',
      '[data-testid*="video" i]',
      '[data-testid*="media" i]',
      '[data-testid*="attachment" i]',
    ].join(',')));
    if (candidates.some(isBlueskyMediaPreviewElement)) return true;
  }
  return false;
}

function findBlueskyMediaRejection(): string | undefined {
  const patterns = [
    /unsupported/i,
    /not supported/i,
    /can't upload/i,
    /cannot upload/i,
    /could not process/i,
    /file type/i,
    /file format/i,
    /対応していません/,
    /サポートされていません/,
    /アップロードできません/,
    /扱えません/,
    /処理できません/,
  ];
  for (const scope of blueskyComposerScopes()) {
    const text = scope instanceof HTMLElement
      ? visibleTextWithoutEditable(scope)
      : '';
    if (patterns.some((pattern) => pattern.test(text))) return text.slice(0, 220);
  }
  return undefined;
}

function isBlueskyMediaPreviewElement(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  if (rect.width <= 4 || rect.height <= 4 || style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  const text = [
    el.getAttribute('alt'),
    el.getAttribute('aria-label'),
    el.getAttribute('data-testid'),
    el.getAttribute('class'),
    el.getAttribute('src'),
    el.textContent,
  ].filter(Boolean).join(' ').toLowerCase();
  if (/profile|avatar/.test(text)) return false;
  if (/add (image|video|media)|attach (image|video|media)|画像を追加|動画を追加|メディアを追加/.test(text)) return false;
  if (el.tagName.toLowerCase() === 'img') return true;
  if (el.tagName.toLowerCase() === 'video' || el.tagName.toLowerCase() === 'canvas') return true;
  return /remove|delete|削除|video|media|attachment|画像|動画|添付/.test(text);
}

function visibleTextWithoutEditable(scope: HTMLElement): string {
  const clone = scope.cloneNode(true) as HTMLElement;
  for (const el of Array.from(clone.querySelectorAll('textarea, input, [contenteditable="true"]'))) {
    el.remove();
  }
  return (clone.innerText ?? clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * v0.5.8〜 Bluesky の post URL を AT Protocol API で取得。
 * - bsky.app の localStorage `BSKY_STORAGE` から accessJwt + did を取り出す
 * - getAuthorFeed で my account の latest 5 件を引いて text 一致するもの探す
 * - PDS は bsky.social が default、 他 PDS の場合は localStorage に書いてある
 */
async function fetchBlueskyRecentPostUrl(text: string): Promise<string | undefined> {
  try {
    // localStorage の構造: BSKY_STORAGE は JSON、 session.currentAccount に accessJwt / did / handle / service
    let session: { accessJwt?: string; did?: string; handle?: string; service?: string } | null = null;
    for (let i = 0; i < 5; i += 1) {
      const raw = localStorage.getItem('BSKY_STORAGE');
      if (raw) {
        try {
          const data = JSON.parse(raw) as {
            session?: { currentAccount?: { accessJwt?: string; did?: string; handle?: string; service?: string } };
          };
          const acc = data.session?.currentAccount;
          if (acc?.accessJwt && acc.did) {
            session = acc;
            break;
          }
        } catch { /* ignore */ }
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!session?.accessJwt || !session.did) {
      log.warn('bluesky: BSKY_STORAGE session not available, skip URL capture');
      return undefined;
    }
    const pds = (session.service || 'https://bsky.social').replace(/\/+$/, '');
    const target = text.replace(/\s+/g, ' ').trim().slice(0, 60);
    const actors = [...new Set([session.did, session.handle].filter((v): v is string => !!v))];
    const endpoints = [
      { base: pds, headers: { Authorization: `Bearer ${session.accessJwt}` } },
      { base: 'https://public.api.bsky.app', headers: undefined },
    ];

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1000));
      for (const endpoint of endpoints) {
        for (const actor of actors) {
          const res = await fetch(
            `${endpoint.base}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=20`,
            endpoint.headers ? { headers: endpoint.headers } : undefined,
          );
          if (!res.ok) continue;
          const data = (await res.json()) as { feed?: Array<{ post?: { uri?: string; record?: { text?: string } } }> };
          const feed = data.feed ?? [];
          for (const item of feed) {
            const postText = (item.post?.record?.text ?? '').replace(/\s+/g, ' ').trim();
            if (postText.startsWith(target)) {
              const uri = item.post?.uri;
              if (uri) {
                // at://did:plc:xxx/app.bsky.feed.post/rkey → bsky.app/profile/handle/post/rkey
                const m = uri.match(/\/app\.bsky\.feed\.post\/([a-zA-Z0-9]+)$/);
                if (m && session.handle) {
                  const url = `https://bsky.app/profile/${session.handle}/post/${m[1]}`;
                  log.info(`bluesky: URL captured via API: ${url}`);
                  return url;
                }
              }
            }
          }
        }
      }
    }
    log.warn('bluesky: post URL not found in recent feed entries');
  } catch (e) {
    log.warn(`bluesky URL capture failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return undefined;
}
