import { log } from '../src/utils/logger';
import type { ImageAttachment, PostResultMessage } from '../src/messages';
import { TIKTOK_SELECTORS, buildTikTokCaption } from '../src/adapters/tiktok';
import { executeMultiStepFlow, type Step } from '../src/utils/step-runner';
import { injectImages, injectTextIntoElement } from '../src/utils/image';
import { sleep, waitForElement } from '../src/utils/dom';
import { waitForPostUrl } from '../src/utils/url-capture';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';
import { t } from '../src/utils/i18n';

/**
 * TikTok のログイン中ユーザー検出。
 *
 * **For You feed / Following feed の page でも `a[href*="/@"]` が大量にあって**
 * 「first match wins」で他クリエイターの handle を拾ってしまう (「全然違う人の
 * 名前が出る」 bug の典型)。 logged-in user 固有の data-e2e 経由のみ採用、
 * 全 anchor 走査の fallback は廃止。 検出できなければ null を返す方が誤検出より
 * マシ。
 */
function detectTikTokUser(): string | null {
  // 戦略 1: TikTok Studio の logged-in user 表示 (`data-e2e="profile-username"`
  // 等は own profile / studio user-info 系のみで使われる)
  const own = document.querySelector<HTMLElement>(
    '[data-e2e="profile-username"], [data-e2e="user-info"] [data-e2e*="username" i]',
  );
  const ownTxt = own?.textContent?.trim();
  if (ownTxt && ownTxt.length > 0 && ownTxt.length <= 30) {
    return ownTxt.startsWith('@') ? ownTxt : '@' + ownTxt;
  }
  // 戦略 2: header の avatar trigger 内に own profile への link がある場合のみ
  const RESERVED = new Set(['login', 'logout', 'settings', 'help', 'studio', 'tiktokstudio']);
  const headerProfile = document.querySelector<HTMLAnchorElement>(
    'header a[href*="/@"], [data-e2e*="profile-icon" i] a[href*="/@"]',
  );
  const m = headerProfile?.getAttribute('href')?.match(/\/@([\w.-]{2,30})/);
  if (m && m[1] && !RESERVED.has(m[1].toLowerCase())) return '@' + m[1];
  return null;
}

export default defineContentScript({
  matches: ['https://www.tiktok.com/*', 'https://tiktok.com/*'],
  main: () => bootstrapContentScript({
    platform: 'tiktok',
    selectors: TIKTOK_SELECTORS,
    detectUser: detectTikTokUser,
    runPost,
  }),
});

async function runPost(
  text: string,
  images?: ImageAttachment[],
  dryRun?: boolean,
): Promise<PostResultMessage> {
  log.info(`TikTok runPost: dryRun=${dryRun} media=${images?.length ?? 0}`);
  const video = images?.find((m) => m.type.startsWith('video/'));
  if (!video) {
    throw new Error(t('runtimeTikTokVideoRequired'));
  }
  const sel = await resolveSelectors('tiktok', TIKTOK_SELECTORS);
  const caption = buildTikTokCaption(text);

  const steps: Step[] = [
    {
      // 動画 file input に inject。upload が始まり caption form が mount される
      name: 'inject-video',
      action: async () => {
        const input = await waitForElement<HTMLInputElement>(sel.fileInput, 45000);
        if (!input) {
          const buttons = dumpVisibleButtons();
          const buttonHint = buttons ? ` [visible buttons: ${buttons}]` : '';
          throw new Error(`file input not found on ${location.pathname}${buttonHint}`);
        }
        await injectImages([video], sel.fileInput);
      },
      // upload + caption form 描画。30s 程度かかることもあるので長め
      settleMs: 200,
    },
    {
      // caption 入力。動画 upload 完了を待ってから fill (waitForElement で出現確認)
      name: 'fill-caption',
      action: async () => {
        const el = await waitForElement<HTMLElement>(sel.captionEditor, 30000);
        if (!el) {
          throw new Error(t('runtimeTikTokCaptionMissing'));
        }
        await setTikTokCaption(caption, sel.captionEditor);
      },
      settleMs: 500,
    },
  ];

  await executeMultiStepFlow({
    steps,
    finalize: {
      // Post button を text マッチで探す。data-e2e 属性も併用
      finder: () => {
        const all = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
          .filter((b) => /^Post$|^投稿$|^公開$/i.test((b.textContent ?? '').trim()));
        const enabled = all.find((b) => !b.disabled);
        const target = enabled ?? all[0] ?? null;
        if (target) {
          try { target.scrollIntoView({ block: 'center' }); } catch { /* ignore */ }
        }
        return target;
      },
      texts: ['Post', '投稿', '公開'],
      timeoutMs: 30000, // 動画処理 + 各種 toggle 反映
      afterClickDelayMs: 250,
    },
    dryRun,
  });

  // dryRun でなければ個別の post URL への遷移を待つ。
  // Studio の /tiktokstudio/content は投稿一覧であり、履歴の deep link として
  // 保存してはいけない。一覧へ遷移した場合は background が thumbnail link から
  // /@user/video/<id> を補完する。
  let url: string | undefined;
  if (!dryRun) {
    // v0.5.7: redirect 検知失敗時に throw しない (実投稿は landing しているケースあり)
    const captured = await waitForPostUrl([
      /^https:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/\d+/,
    ], 60000, 250, [
      // 一覧へ遷移する variant は background が最新 video link を補完する。
      // 個別 URL を 60s 待ち切らず、一覧描画の探索へ進む。
      /^https:\/\/(?:www\.)?tiktok\.com\/tiktokstudio\/content/,
    ]);
    if (captured) url = captured;
  }

  return {
    type: 'POST_RESULT',
    platform: 'tiktok',
    success: true,
    url,
  };
}

async function setTikTokCaption(caption: string, selector: string): Promise<void> {
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await injectTextIntoElement(caption, selector);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }

    await sleep(500);
    const visible = readTikTokCaption(selector);
    if (captionMatches(visible, caption)) return;

    lastError = caption
      ? `caption mismatch after inject attempt ${attempt}: "${visible.slice(0, 80)}"`
      : `caption was not cleared after inject attempt ${attempt}: "${visible.slice(0, 80)}"`;
    log.warn(`TikTok: ${lastError}`);
    await injectTextIntoElement('', selector).catch(() => {});
    await sleep(300);
  }
  throw new Error(lastError ?? 'TikTok caption injection failed');
}

function readTikTokCaption(selector: string): string {
  const el = document.querySelector<HTMLElement>(selector);
  return (el?.innerText ?? el?.textContent ?? '').trim();
}

function captionMatches(visible: string, expected: string): boolean {
  const actual = visible.replace(/\s+/g, ' ').trim();
  const normalizedExpected = expected.replace(/\s+/g, ' ').trim();
  if (!normalizedExpected) return actual.length === 0;
  const snippet = normalizedExpected.slice(0, Math.min(20, normalizedExpected.length));
  return actual.includes(snippet);
}

function dumpVisibleButtons(): string {
  return Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], a[href]'))
    .map((el) => (
      el.getAttribute('aria-label') ??
      el.textContent ??
      ''
    ).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12)
    .join(' | ');
}
