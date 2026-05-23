import { log } from '../src/utils/logger';
import type { ImageAttachment, PostResultMessage } from '../src/messages';
import { INSTAGRAM_SELECTORS } from '../src/adapters/instagram';
import { executeMultiStepFlow, type Step } from '../src/utils/step-runner';
import { injectImages, injectTextIntoElement } from '../src/utils/image';
import { sleep, waitForElement } from '../src/utils/dom';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';

/**
 * Instagram のログイン中ユーザー名検出。
 *
 * 旧コード戦略 2 (`a[href^="/"]` 全走査) は home feed の post 作者 link を
 * 拾ってしまい **「全然違う人の名前が表示される」 bug の典型** だった。
 * 削除して、 side nav の Profile link (aria-label で同定) のみ採用。
 */
function detectInstagramUser(): string | null {
  const RESERVED = new Set([
    'home', 'explore', 'reels', 'direct', 'inbox', 'p', 'reel', 'stories',
    'accounts', 'notifications', 'create', 'settings', 'shop', 'bookmarks',
  ]);

  const isLikely = (s: string | undefined | null): s is string =>
    !!s && /^[\w._]{2,30}$/.test(s) && !RESERVED.has(s.toLowerCase());

  // v0.4.97: IG は sidebar の Profile link から aria-label を削除し、
  // text content だけになった (probe 2026-05-23 確認)。
  //   旧: <a aria-label="Profile" href="/ren.fujimoto.89/">
  //   新: <a href="/ren.fujimoto.89/"><svg.../><span>Profile</span></a>

  // Strategy 1: aria-label が残ってる variant (旧 UI / 一部 A/B)
  const navProfile = document.querySelector<HTMLAnchorElement>(
    'a[aria-label*="Profile" i][href^="/"], a[aria-label*="プロフィール"][href^="/"], a[aria-label*="个人主页" i][href^="/"]',
  );
  let m = navProfile?.getAttribute('href')?.match(/^\/([^/?#]+)\/$/);
  if (isLikely(m?.[1])) return m![1]!;

  // Strategy 2: sidebar の text 「Profile」 「プロフィール」 「个人主页」 等を持つ link
  const PROFILE_TEXTS = ['profile', 'プロフィール', '个人主页', '내 프로필', 'profil', 'perfil'];
  const links = document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    const text = (link.textContent ?? '').trim().toLowerCase();
    if (!text || text.length > 50) continue;
    if (!PROFILE_TEXTS.some((p) => text.startsWith(p.toLowerCase()))) continue;
    const hm = href.match(/^\/([^/?#]+)\/$/);
    if (isLikely(hm?.[1])) return hm![1]!;
  }

  // Strategy 3: og:url meta (login wall / fallback)
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:url"]')
    ?.content?.match(/instagram\.com\/([^/?#]+)\/?/);
  if (isLikely(og?.[1])) return og![1]!;

  return null;
}

export default defineContentScript({
  matches: ['https://www.instagram.com/*', 'https://instagram.com/*'],
  main: () => bootstrapContentScript({
    platform: 'instagram',
    selectors: INSTAGRAM_SELECTORS,
    detectUser: detectInstagramUser,
    runPost,
  }),
});

async function runPost(
  text: string,
  images?: ImageAttachment[],
  dryRun?: boolean,
): Promise<PostResultMessage> {
  if (!images || images.length === 0) {
    throw new Error('Instagram は画像 / 動画が必須です(text のみ投稿は不可)');
  }

  const sel = await resolveSelectors('instagram', INSTAGRAM_SELECTORS);

  // IG は "Turn on Notifications" / "Save Your Login Info?" / "Cookie Banner" 等の
  // ポップアップが wizard 中に被さってくるので、先に dismiss しておく。
  // Surface 実機 2026-05-13 で発覚: 通知許可 dialog が Create dialog に被さって
  // findDialogButtonByText が誤検索する事故を防ぐ
  dismissOverlayDialogs();

  // Wizard 構造 (2026-05-01 検証):
  //   1. Create button click → Modal #1 (file 選択)
  //   2. file inject → Modal #2 "Crop" (Next で進む)
  //   3. Next click → Modal #3 "Edit" (Next で進む)
  //   4. Next click → Modal #4 caption + Share
  //   5. caption 入力 → finalize で "Share" click
  const steps: Step[] = [
    // Step 1: sidebar の "Create" trigger を click。
    //
    // 現代 IG (2025+) では sidebar の "Create" を click すると、popover を
    // 経由せず **直接 file input 付きの "Create new post" dialog** が開く
    // (Surface 実機 2026-05-13 で確認)。strict な svg[aria-label] 検出で
    // "Create story" 等の似た UI 要素を踏まないようにする。
    //
    // 一部 A/B test variant では popover (Post/Reel/Story/Live) を挟む形に
    // なってる可能性があるが、その場合は file input が 10s 出ないので
    // step 2 で明示的に throw → auto-triage で variant 対応する流れ
    {
      name: 'open-create-modal',
      action: async () => {
        // 既に dialog 内に file input があれば skip (再投稿等)
        const existingFi = document.querySelector(sel.fileInput);
        if (existingFi) {
          log.info('IG: create modal already open, skipping Create click');
          return;
        }
        const trigger = findCreateTrigger();
        if (!trigger) {
          throw new Error('IG: sidebar の "Create" / "New post" trigger が見つかりません');
        }
        trigger.click();
        // v0.4.60: Create click 後、variant 判別 — 一部アカウント (Personal でも)
        // sidebar "+" → "Post / Live video / Ad" の popover が挟まる variant が
        // ある (user 報告 2026-05-17、本垢 Brave で再現)。fixture でいうと
        // ren.fujimoto.89 では popover 出ずに直接 dialog だが、別アカウントでは
        // popover 経由になる。short wait のあと file input が直接見えれば直接
        // variant、見えなければ popover の "Post" を選ぶ。
        await sleep(800);
        if (!document.querySelector(sel.fileInput)) {
          const postItem = findCreateSubmenuItem(['Post', '投稿', 'Publicación', 'Publication']);
          if (postItem) {
            log.info('IG: popover variant detected, clicking "Post" submenu item');
            postItem.click();
          } else {
            log.warn('IG: popover の Post も file input も見つからず、10s 待機継続 (variant 不明)');
          }
        }
        // dialog mount を waitForElement で待つ。step-runner の awaitNextDom は
        // advance click 後にしか動かないので、advance が無い step (= 単発 click) は
        // action 内で待つ必要がある
        const fi = await waitForElement<HTMLInputElement>(sel.fileInput, 10000);
        if (!fi) {
          throw new Error('IG: "Create new post" dialog が出現しませんでした (file input 不在)');
        }
      },
      settleMs: 300,
    },
    // Step 2: image inject。Modal #2 (Crop) に自動遷移する
    {
      name: 'inject-image',
      action: async () => {
        // file input が出るまで待ち
        const fi = await waitForElement<HTMLInputElement>(sel.fileInput, 8000);
        if (!fi) {
          throw new Error('IG: file input が dialog 内に出現しませんでした');
        }
        await injectImages(images, sel.fileInput);
        // v0.4.61: Crop dialog が mount された直後に Original aspect ratio を選んで、
        // 横長/縦長の写真が IG default の 1:1 で左右 (or 上下) 見切れるのを回避。
        // 失敗は warn のみで続行 (IG が許す範囲外なら IG 側で勝手に fit させる、
        // ユーザー報告は: 2026-05-17 横長で左右見切れ)。
        await sleep(800); // Crop dialog 内部 render 待ち
        await selectOriginalCrop();
      },
      settleMs: 200,
      // Crop 画面の Next ボタン click で進む
      advance: {
        // upload エラー (file too small 等) も polling 中に検出する
        finder: () => {
          checkForIgErrorDialog();
          return findDialogButtonByText(['Next', '次へ']);
        },
        timeoutMs: 15000, // upload + crop 画面 mount に時間かかる
      },
      // Edit (filter) 画面の Next ボタンが出るまで待つ
      awaitNextDom: { selector: '[role="dialog"]', timeoutMs: 8000 },
    },
    // Step 3: Edit (filter) 画面で Next click → caption 画面へ
    {
      name: 'skip-filter',
      action: async () => {
        // filter は default のまま (画像加工しない)
      },
      settleMs: 500,
      advance: {
        // polling のたびにエラー dialog 検出も走らせて、IG 側が
        // 'Something went wrong' / 'File too small' 等を後から被せた場合に
        // 即座に explicit error にする
        finder: () => {
          checkForIgErrorDialog();
          return findDialogButtonByText(['Next', '次へ']);
        },
        timeoutMs: 8000,
      },
      // caption editor が出るまで待つ
      awaitNextDom: { selector: sel.captionEditor, timeoutMs: 10000 },
    },
    // Step 4: caption 入力 → finalize=Share
    {
      name: 'fill-caption',
      action: async () => {
        // 本文がある場合のみ caption inject (空文字 inject は Lexical の
        // placeholder structure <p><br></p> を破壊するリスクあり、v0.4.59)
        if (text) {
          await injectTextIntoElement(text, sel.captionEditor);
          // caption DOM verify + retry (v0.4.66): IG の Lexical editor は
          // paste の DOM 反映が遅延することがあり、 旧コードは Share button が
          // image 添付済みで enable のため caption 空のまま投稿される silent
          // failure が起こっていた (user 報告 2026-05-21: 「画像 OK だが本文空」)。
          // 反映を polling で verify し、 入ってなければ 1 回だけ retry。
          const ok = await waitForCaptionPopulated(sel.captionEditor, text, 3000);
          if (!ok) {
            log.warn('IG: caption 反映が確認できず再注入を試行');
            await injectTextIntoElement(text, sel.captionEditor);
            const ok2 = await waitForCaptionPopulated(sel.captionEditor, text, 4000);
            if (!ok2) {
              throw new Error(
                'IG: caption editor に本文が反映されませんでした (Lexical state 同期失敗)',
              );
            }
          }
        }
        // caption inject 後 (or 画像のみ投稿時は upload 完了後)、Lexical の
        // internal state まで反映されたかを Share button の状態で verify する。
        // Lexical は paste を microtask で setState するため、見かけ上 DOM に
        // テキストが入っていても Share button が内部で disabled のまま、
        // という silent failure があり得る。本文無しでも画像処理後の Share
        // enable polling は意味があるのでそのまま実行する。
        await waitForShareEnabled(8000);
      },
      settleMs: 500,
    },
  ];

  await executeMultiStepFlow({
    steps,
    finalize: {
      // Share ボタン (dialog 内、最後の wizard 画面のみ)
      finder: () => findDialogButtonByText(['Share', '共有', 'Post']),
      afterClickDelayMs: 3000,
    },
    dryRun,
  });

  // dry-run は finalize click をスキップしてるので verify も skip
  if (!dryRun) {
    await verifyInstagramPosted();
  }

  return {
    type: 'POST_RESULT',
    platform: 'instagram',
    success: true,
  };
}

/**
 * Crop dialog 内の "Select crop" を click → popover の "Original" を click して
 * 元アスペクト比を保つ (v0.4.61)。IG が許す範囲外でも IG 側で fit するので
 * 失敗は warn のみで続行 (= 既存挙動 = 1:1 default)。
 */
async function selectOriginalCrop(): Promise<void> {
  const cropBtn = findCropAspectButton();
  if (!cropBtn) {
    log.warn('IG: "Select crop" button が Crop dialog に見つかりません (UI 変更?)、default 1:1 で続行');
    return;
  }
  cropBtn.click();
  await sleep(400);
  const originalItem = findCropOption([
    'Original', 'オリジナル', '元のサイズ', '元の比率', 'Original ratio',
  ]);
  if (!originalItem) {
    log.warn('IG: Crop popover に "Original" 系の選択肢が無い、default 1:1 で続行');
    cropBtn.click(); // popover を閉じる (toggle)
    await sleep(200);
    return;
  }
  originalItem.click();
  log.info('IG: Original aspect ratio を選択');
  await sleep(400);
}

function findCropAspectButton(): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
  const cropDlg = dialogs.find((d) => /Crop|切り抜き|トリミング/i.test(d.getAttribute('aria-label') ?? '')) ?? dialogs[dialogs.length - 1];
  if (!cropDlg) return null;
  const btn = Array.from(cropDlg.querySelectorAll<HTMLElement>('button, [role="button"]'))
    .find((b) => {
      const t = (b.textContent ?? '').trim();
      return t === 'Select crop' || t === 'トリミング' || t === '切り抜き';
    });
  return btn ?? null;
}

function findCropOption(texts: string[]): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    'button, [role="button"], [role="menuitem"], [role="radio"], [role="option"]',
  );
  for (const el of candidates) {
    const t = (el.textContent ?? '').trim();
    if (texts.includes(t)) return el;
  }
  // span 内に label がある case (button は親)
  const spans = document.querySelectorAll<HTMLElement>('span, div');
  for (const el of spans) {
    const t = (el.textContent ?? '').trim();
    if (texts.includes(t)) {
      const clickable = el.closest('button, [role="button"], [role="menuitem"], [role="radio"]') as HTMLElement | null;
      if (clickable) return clickable;
    }
  }
  return null;
}

/**
 * IG caption editor に inject した本文が DOM に反映されたかを polling で確認 (v0.4.66)。
 * IG (Lexical) は paste event → React setState → DOM 反映の経路で 600ms 以上
 * 掛かることがあり、 inject-helper の verify (visible.length > 0) は placeholder
 * の残骸等で誤って ok=true を返すことがある。 ここでは本文先頭 20 char が
 * editor の innerText に出現するかを厳密チェックする。
 *
 * 戻り値で結果を返すので、 caller が retry / throw の判断をする。
 */
async function waitForCaptionPopulated(
  captionEditorSelector: string,
  text: string,
  timeoutMs: number,
): Promise<boolean> {
  const snippet = text.slice(0, Math.min(20, text.length)).trim();
  if (!snippet) return true;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const editors = document.querySelectorAll<HTMLElement>(captionEditorSelector);
    for (const el of editors) {
      const visible = (el.innerText ?? el.textContent ?? '').trim();
      if (visible.includes(snippet)) return true;
    }
    await sleep(150);
  }
  return false;
}

/**
 * Share button が disabled でなくなるまで poll する (v0.4.58)。
 * caption inject が Lexical の internal state まで届かないと button が
 * disabled のままで finalize が空打ちになる silent failure の検出用。
 *
 * 戻り値で結果を返すのではなく、enable にならなければ throw して step を
 * 失敗扱いにする(= step-runner が retry 候補に渡せる)。
 */
async function waitForShareEnabled(timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const share = findDialogButtonByText(['Share', '共有', 'Post']);
    if (share) {
      const ariaDisabled = share.getAttribute('aria-disabled');
      const elDisabled = (share as HTMLButtonElement).disabled;
      if (!elDisabled && ariaDisabled !== 'true') {
        log.info('IG: Share button enable を確認');
        return;
      }
    }
    // share button 不在は wizard 中の他の step 表示の可能性もあるので polling 継続
    await sleep(200);
  }
  throw new Error(
    'IG: caption 入力後に Share button が enable になりませんでした (Lexical state 反映失敗の可能性)',
  );
}

/**
 * Share click 後に **実際に投稿が成立したか** を verify する。
 *
 * これが無いと「Share button を click した」だけで `success: true` を返してしまい、
 * - IG 側で error toast が出ていた / dialog 内エラーで止まっていた
 * - wizard が想定外に追加された (Audience step 等) で Share 押下に至っていなかった
 * といった silent failure を user が「Tutti は成功と言ったが投稿が無い」と
 * 経験することになる (2026-05-13 ユーザ報告)。
 *
 * 検証方針: Share click 後の dialog が消える / または "shared" 系の成功 UI に
 * 切り替わるのを最大 30s 待つ。timeout / 内部に error text を発見した場合は throw。
 */
async function verifyInstagramPosted(timeoutMs = 30_000): Promise<void> {
  const ERROR_TEXT_RE = /error|failed|try again|too large|please try|エラー|失敗|もう一度/i;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) {
      // dialog 消失 = post 確定。返却 OK
      log.info('IG: post verified (dialog closed)');
      return;
    }
    // dialog はまだあるが、success 状態 ("Your post has been shared" 等) に
    // 切り替わっていれば OK
    const txt = (dialog.textContent ?? '').slice(0, 500);
    if (/shared|共有しました|posted/i.test(txt)) {
      log.info('IG: post verified (success message visible)');
      return;
    }
    // エラー表示が出ている場合は即時 throw
    if (ERROR_TEXT_RE.test(txt)) {
      throw new Error(
        `IG: Share 後の dialog にエラー表示が出ました — ${txt.slice(0, 200)}`,
      );
    }
    await sleep(500);
  }
  throw new Error(
    `IG: Share click 後 ${timeoutMs / 1000}s 経っても dialog が閉じませんでした(投稿が完了してない可能性、UI が変わった疑い)`,
  );
}

/**
 * "Turn on Notifications" / "Save Your Login Info?" / "Cookie Banner" 等の
 * 邪魔な overlay dialog を dismiss して wizard 操作の妨げを排除。
 * 安全なボタン ("Not Now" / "あとで" / "Decline") のみ click、危険なボタン
 * ("Turn On" / "Allow" / "Save") は触らない。
 */
function dismissOverlayDialogs(): void {
  const SAFE_DISMISS_TEXTS = ['Not Now', 'あとで', 'いいえ', 'No thanks', 'Decline', '後で'];
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
  for (const dialog of dialogs) {
    // Create dialog 自体は dismiss しない (aria-label で識別)
    const aria = dialog.getAttribute('aria-label') ?? '';
    if (/create|投稿/i.test(aria)) continue;
    const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('button, [role="button"]'));
    for (const b of buttons) {
      const t = (b.textContent ?? '').trim();
      if (SAFE_DISMISS_TEXTS.includes(t)) {
        log.info(`IG: dismissing overlay dialog via "${t}"`);
        b.click();
        break;
      }
    }
  }
}

/**
 * IG が wizard 中に表示する error dialog ("Something went wrong", "File too small"
 * 等) を検出。見つかれば throw して silent stall を防ぐ。
 * step.action / advance の前後で呼ぶと、step が button 不在で固まる前にエラー化できる。
 */
function checkForIgErrorDialog(): void {
  const ERROR_KEYWORDS = [
    'Something went wrong', '問題が発生', "couldn't be uploaded", 'アップロードできませんでした',
    'too small', '小さすぎ', 'too large', '大きすぎ',
  ];
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
  for (const dialog of dialogs) {
    const text = (dialog.textContent ?? '').slice(0, 500);
    for (const kw of ERROR_KEYWORDS) {
      if (text.includes(kw)) {
        throw new Error(`IG: エラー dialog 検出 — ${text.slice(0, 200)}`);
      }
    }
  }
}

/**
 * sidebar の "Create" trigger を多段戦略で探す。
 * IG sidebar はテキストラベル無しの SVG アイコンで構成されるため、aria-label
 * からの逆引きが最も堅い。複数 locale 対応 + 旧 layout fallback も用意。
 */
function findCreateTrigger(): HTMLElement | null {
  // 戦略 1: SVG の aria-label から (最も堅い。Locale 違いに強い)
  const ariaLabels = ['New post', '新規投稿', 'Crear', 'Nuevo', 'Создать', '새 게시물'];
  for (const label of ariaLabels) {
    const svg = document.querySelector<SVGElement>(`svg[aria-label="${label}"]`);
    const parent = svg?.closest('a, button, [role="link"], [role="button"]') as HTMLElement | null;
    if (parent) return parent;
  }
  // 戦略 2: aria-label 完全一致 (regex でない、broad match 回避)
  const exactAria = ['New post', '新規投稿', 'Create'];
  for (const aria of exactAria) {
    const el = document.querySelector<HTMLElement>(`a[aria-label="${aria}"], button[aria-label="${aria}"], [role="link"][aria-label="${aria}"], [role="button"][aria-label="${aria}"]`);
    if (el) return el;
  }
  return null;
}

/**
 * sidebar Create → popover で出る投稿種別メニュー (Post / Reel / Story / Live)。
 * popover は ロール無し / span 単独 などのことも多いため、document 全体で
 * text 完全一致を探す。scope を [role="menu"] や [role="dialog"] に絞ると
 * popover が role 無しの場合に外れるので絞らない。
 */
function findCreateSubmenuItem(texts: string[]): HTMLElement | null {
  // 戦略 1: clickable element の textContent 完全一致
  const clickables = document.querySelectorAll<HTMLElement>(
    'div[role="button"], button, a[role="link"], a[role="button"], [tabindex="0"]',
  );
  for (const el of clickables) {
    const t = (el.textContent ?? '').trim();
    if (texts.includes(t)) return el;
  }
  // 戦略 2: span / div の textContent 完全一致 → 親の clickable を返す
  const all = document.querySelectorAll<HTMLElement>('span, div');
  for (const el of all) {
    const t = (el.textContent ?? '').trim();
    if (texts.includes(t)) {
      const clickable = el.closest('div[role="button"], button, a, [tabindex="0"]') as HTMLElement | null;
      if (clickable) return clickable;
    }
  }
  return null;
}

/**
 * Create dialog 内で text が完全一致 (trim 後) する button / [role="button"] を
 * 探す。Notification dialog 等 別の overlay dialog の同名 button を誤検出
 * しないため、aria-label が "Create"/"投稿" を含む dialog に scope する。
 * 同じテキストが複数あれば最後のものを返す (大抵は最下部の primary action)。
 */
function findDialogButtonByText(texts: string[]): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
  // Create dialog (aria-label="Create new post" 等) を優先
  const createDialogs = dialogs.filter((d) => /create|投稿/i.test(d.getAttribute('aria-label') ?? ''));
  const target = createDialogs.length > 0 ? createDialogs : dialogs;
  let lastMatch: HTMLElement | null = null;
  for (const dialog of target) {
    const buttons = dialog.querySelectorAll<HTMLElement>('button, [role="button"]');
    for (const b of buttons) {
      const t = (b.textContent ?? '').trim();
      if (texts.includes(t)) lastMatch = b;
    }
  }
  return lastMatch;
}
