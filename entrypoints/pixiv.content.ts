import { initLogLevelFromSettings, log } from '../src/utils/logger';
import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { PIXIV_SELECTORS, buildPixivTitle, extractPixivTags } from '../src/adapters/pixiv';
import { executeMultiStepFlow, type Step } from '../src/utils/step-runner';
import { injectImages, injectTagList, injectTextIntoElement } from '../src/utils/image';
import { sleep } from '../src/utils/dom';
import { buildDiagnosis } from '../src/utils/diagnose';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { detectAndReportUser } from '../src/utils/user-detect';

/**
 * Pixiv の logged-in user を header の自分の作品リンクから検出する。
 * `a[href^="/users/<id>"]` のうち最初に現れるものは大抵 self-link。
 * URL 内の数値 user id ではなく display 名を取りたいので、その後の avatar/name 要素から拾う。
 */
function detectPixivUser(): string | null {
  // 戦略 1: globals.userData (Pixiv が SSR で埋め込む user data) から
  // window.dataLayer["pixiv-user-id"] や globalInitData
  // (但し ISOLATED world からは page-context window が見えないので不可)
  // 戦略 2: header / nav の self user link (`/users/<numeric-id>`) を辿って img alt / title 抽出
  // 戦略 3: localStorage / cookie ベース (Pixiv は cookie に user_id を入れる時がある)

  const RESERVED = new Set(['login', 'logout', 'settings', 'help', 'manga', 'illustration']);
  const isLikely = (s: string | null | undefined): s is string =>
    !!s && s.length >= 1 && s.length <= 40 && !RESERVED.has(s.toLowerCase());

  // /users/<numeric-id> を持つ anchor を全部走査。img の alt / title / aria-label / 子テキストから取る
  const userLinks = document.querySelectorAll<HTMLAnchorElement>('a[href*="/users/"]');
  for (const link of userLinks) {
    const href = link.getAttribute('href') ?? '';
    // numeric id 検証 (search や検索結果の anchor を弾く)
    if (!/\/users\/\d+(?:[/?#]|$)/.test(href)) continue;
    // 候補 1: img alt / title
    const img = link.querySelector('img');
    if (img) {
      const fromImg = (img.getAttribute('alt') ?? '').trim() || (img.getAttribute('title') ?? '').trim();
      if (isLikely(fromImg)) return fromImg;
    }
    // 候補 2: link 自身の aria-label / title
    const fromLink = (link.getAttribute('aria-label') ?? '').trim() || (link.getAttribute('title') ?? '').trim();
    if (isLikely(fromLink)) return fromLink;
    // 候補 3: link 内の子要素 textContent (40 char 上限)
    const childText = (link.textContent ?? '').trim().slice(0, 40);
    if (isLikely(childText)) return childText;
  }

  // header の dropdown trigger fallback
  const accountBtn = document.querySelector<HTMLElement>(
    '[aria-label*="account" i], [data-gtm-label*="account" i], button[aria-haspopup]',
  );
  if (accountBtn) {
    const txt = accountBtn.textContent?.trim().slice(0, 40);
    if (isLikely(txt)) return txt;
  }
  return null;
}

export default defineContentScript({
  matches: ['https://www.pixiv.net/*', 'https://pixiv.net/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      log.info(`Pixiv listener got msg: type=${msg.type ?? '?'} platform=${(msg as { platform?: string }).platform ?? '?'}`);
      if (msg.type === 'DIAGNOSE_PLATFORM' && msg.platform === 'pixiv') {
        sendResponse(buildDiagnosis('pixiv', PIXIV_SELECTORS, detectPixivUser));
        return true;
      }
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'pixiv') return;

      void runPost(msg.text, msg.images, msg.dryRun)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'pixiv',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    void detectAndReportUser('pixiv', detectPixivUser);
    void initLogLevelFromSettings();
    log.info('Pixiv content script ready');
  },
});

async function runPost(
  text: string,
  images?: ImageAttachment[],
  dryRun?: boolean,
): Promise<PostResultMessage> {
  log.info(`Pixiv runPost: dryRun=${dryRun} images=${images?.length ?? 0} textLen=${text.length}`);
  if (!images || images.length === 0) {
    throw new Error('Pixiv は画像が必須です(本文のみ投稿は不可)');
  }

  const sel = await resolveSelectors('pixiv', PIXIV_SELECTORS);
  const title = buildPixivTitle(text);
  const tags = extractPixivTags(text);

  // Pixiv は単一ページ form なので advance なしの sequential step で表現する。
  // 1) 画像注入 / 2) title / 3) caption / 4) tags → finalize で Post
  const steps: Step[] = [
    {
      name: 'inject-images',
      action: async () => {
        await injectImages(images, sel.fileInput);
      },
      // サムネイル描画 + 内部 React state 反映を待つ。Pixiv のサーバ upload は
      // injectImages 内の MAIN-world helper で完了確認済 (PerformanceObserver)。
      settleMs: 1500,
    },
    {
      name: 'fill-title',
      action: async () => {
        await injectTextIntoElement(title, sel.titleInput);
      },
      settleMs: 200,
    },
    {
      name: 'fill-caption',
      action: async () => {
        // text 全文を caption に入れる(Pixiv は事実上文字数無制限)
        await injectTextIntoElement(text, sel.captionTextarea);
      },
      settleMs: 200,
    },
    {
      // Pixiv は tags が必須 (Required ラベル付き)。本文の #hashtag を抽出、
      // 無ければ default ['Tutti'] が使われる。Enter で 1 tag ずつ確定。
      name: 'fill-tags',
      action: async () => {
        await injectTagList(tags, sel.tagInput);
      },
      settleMs: 400,
    },
    {
      // Visible to (x_restrict) も必須。クロスポスト content は基本一般向けなので
      // "All ages" (general) を選択。AI artist や R-18 投稿は手動切替前提。
      // React radio は input.click() で onChange が走る (delegated event)。
      name: 'set-visibility',
      action: async () => {
        const r = document.querySelector<HTMLInputElement>(sel.visibilityAllAges);
        if (!r) throw new Error('Pixiv: Visible to (x_restrict) radio が見つかりません');
        r.click();
      },
      settleMs: 200,
    },
    {
      // AI-generated work (ai_type) も必須。default は "No" (notAiGenerated)。
      // AI artist 用の "Yes" 切替は将来 settings で expose 予定。
      name: 'set-ai-flag',
      action: async () => {
        const r = document.querySelector<HTMLInputElement>(sel.aiTypeNo);
        if (!r) throw new Error('Pixiv: AI-generated work (ai_type) radio が見つかりません');
        r.click();
      },
      settleMs: 200,
    },
    {
      // Adult content (sexual) も必須。クロスポスト content は基本 non-sexual。
      // 4 つ目の hidden required field、これがないと bottom Post が disabled のまま。
      name: 'set-adult-flag',
      action: async () => {
        const r = document.querySelector<HTMLInputElement>(sel.sexualNo);
        if (!r) throw new Error('Pixiv: Adult content (sexual) radio が見つかりません');
        r.click();
      },
      settleMs: 200,
    },
  ];

  await executeMultiStepFlow({
    steps,
    finalize: {
      // Pixiv は header Post (`.gtm-work-post-button-in-header-click`) と
      // bottom Post (form 内の charcoal-button) の 2 種類が DOM にある。
      // header は analytics-tagged で常時 enabled だが、実機 (2026-05-02) で
      // click しても投稿が走らない (preview / scroll 系 CTA)。
      // 実際の submit は bottom Post。全 required (image + title + tags +
      // visibility + AI + adult) が埋まると enabled になる。
      // finder は bottom Post (header の gtm class を除いた "Post" button) を返す。
      // クリック前に scrollIntoView を呼んで、React がイベントを確実に受けるよう
      // 視野内に持ってくる (実機検証で out-of-viewport の click が時々無視されてた)。
      finder: () => {
        const all = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
          .filter((b) => /^Post$|^投稿$/.test((b.textContent ?? '').trim()));
        const nonHeader = all.filter(
          (b) => !b.className.includes('gtm-work-post-button-in-header-click'),
        );
        const enabled = nonHeader.find((b) => !b.disabled);
        const target = enabled ?? nonHeader[0] ?? all[0] ?? null;
        if (target) {
          try { target.scrollIntoView({ block: 'center' }); } catch { /* ignore */ }
        }
        return target;
      },
      texts: ['Post', '投稿', 'Submit'],
      // 全 required field が valid になるまで時間がかかる (画像 upload 完了 + radio
      // click の React 反映を含めて 5〜10s)。8s default だと足りないので 15s に
      timeoutMs: 15000,
      // submit 後の navigation 待ち。Pixiv は投稿成功で /users/<id> や /artworks/<id> へ遷移
      afterClickDelayMs: 3000,
    },
    dryRun,
  });

  // dry-run 時に念のため compose ページの state を 0.5s 安定させる
  await sleep(500);

  return {
    type: 'POST_RESULT',
    platform: 'pixiv',
    success: true,
  };
}
