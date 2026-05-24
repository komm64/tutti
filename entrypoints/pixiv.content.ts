import { log } from '../src/utils/logger';
import type { ImageAttachment, PostResultMessage } from '../src/messages';
import { getSettings } from '../src/storage';
import {
  PIXIV_SELECTORS,
  buildPixivTitle,
  extractPixivTags,
  stripHashtagsForPixivCaption,
} from '../src/adapters/pixiv';
import { executeMultiStepFlow, type Step } from '../src/utils/step-runner';
import { injectImages, injectTagList, injectTextIntoElement } from '../src/utils/image';
import { sleep } from '../src/utils/dom';
import { waitForPostUrl } from '../src/utils/url-capture';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';

/**
 * Pixiv の logged-in user を header の自分の作品リンクから検出する。
 * `a[href^="/users/<id>"]` のうち最初に現れるものは大抵 self-link。
 * URL 内の数値 user id ではなく display 名を取りたいので、その後の avatar/name 要素から拾う。
 */
/**
 * Pixiv のログイン中ユーザー検出。
 *
 * 旧コードは `a[href*="/users/"]` を全走査して最初の anchor の img alt /
 * aria-label / textContent を返していた。 が、 Pixiv home の「おすすめのユーザー」
 * widget / illustration card の作者リンク / フォロワー一覧などに `/users/<id>`
 * リンクが大量にあって **first match が他ユーザーになる** ことが頻発する
 * (= 「全然違う人の名前が出る」 bug の典型)。
 *
 * 修正方針: **header 領域内の self link のみ**採用、 body の card 内 link は
 * 拾わない。 header 内に self link が無いページ (= 詳細ページや login 前)
 * では null を返す方が誤検出よりマシ。
 */
function detectPixivUser(): string | null {
  const RESERVED = new Set(['login', 'logout', 'settings', 'help', 'manga', 'illustration']);
  const isLikely = (s: string | null | undefined): s is string =>
    !!s && s.length >= 1 && s.length <= 40 && !RESERVED.has(s.toLowerCase());

  // v0.4.97: 現代 Pixiv は <header> タグを使ってない (probe 2026-05-23)。
  // 代わりに 「self profile link は /following + /followers の兄弟 link を持つ」
  // 性質で他ユーザーの widget (recommend, feed) と区別する。
  //
  // self ページ DOM (probe で確認):
  //   <a href="/users/12345">ren.fujimoto</a>     ← 表示名
  //   <a href="/users/12345/following">1 Following</a>
  //   <a href="/users/12345/followers">0 Followers</a>
  // 他ユーザー widget:
  //   <a href="/en/users/9544086"><img alt="ルルー"></a>
  //   <a href="/en/users/9544086">ルルー</a>       ← following/followers なし

  // Step 1: 全ページから `/users/<id>/following` の anchor を探して self id を確定
  const followingLink = document.querySelector<HTMLAnchorElement>(
    'a[href*="/users/"][href$="/following"]',
  );
  const followingHref = followingLink?.getAttribute('href') ?? '';
  const idMatch = followingHref.match(/\/users\/(\d+)\/following/);
  if (!idMatch || !idMatch[1]) return null;
  const selfId = idMatch[1];

  // Step 2: 同じ user id の display-name link (= /users/<id> 直)を探す
  const displayLinks = document.querySelectorAll<HTMLAnchorElement>(
    `a[href*="/users/${selfId}"]`,
  );
  for (const link of displayLinks) {
    const href = link.getAttribute('href') ?? '';
    // 末尾が /following / /followers / ? や # で終わるものは除外。/users/<id> 直のみ
    if (!new RegExp(`/users/${selfId}(?:[/?#]|$)`).test(href)) continue;
    if (/\/following|\/followers/.test(href)) continue;
    // img alt > aria-label > textContent の順で display name を取る
    const img = link.querySelector('img');
    if (img) {
      const fromImg = (img.getAttribute('alt') ?? '').trim() || (img.getAttribute('title') ?? '').trim();
      if (isLikely(fromImg)) return fromImg;
    }
    const fromLink = (link.getAttribute('aria-label') ?? '').trim() || (link.getAttribute('title') ?? '').trim();
    if (isLikely(fromLink)) return fromLink;
    const childText = (link.textContent ?? '').trim().slice(0, 40);
    if (isLikely(childText)) return childText;
  }
  return null;
}

export default defineContentScript({
  matches: ['https://www.pixiv.net/*', 'https://pixiv.net/*'],
  main: () => bootstrapContentScript({
    platform: 'pixiv',
    selectors: PIXIV_SELECTORS,
    detectUser: detectPixivUser,
    runPost,
  }),
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
  // hashtag は tags フィールドに入れたので caption からは除く (Pixiv は caption 内
  // `#word` を auto-link しないので、両方に出すと末尾が「#a #b #c」だけになって
  // 意味がない)
  const caption = stripHashtagsForPixivCaption(text);

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
        // hashtag を除いた caption を入れる (Pixiv は事実上文字数無制限)
        await injectTextIntoElement(caption, sel.captionTextarea);
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
      // Visible to (x_restrict) も必須。 default は Settings.pixivVisibility
      // ('general' クロスポスト標準、 R-18 投稿者は 'r18' / 'r18g' に切替可)。
      // React radio は input.click() で onChange が走る (delegated event)。
      name: 'set-visibility',
      action: async () => {
        const { pixivVisibility } = await getSettings();
        const sel2 =
          pixivVisibility === 'r18' ? sel.visibilityR18 :
          pixivVisibility === 'r18g' ? sel.visibilityR18g :
          sel.visibilityAllAges;
        const r = document.querySelector<HTMLInputElement>(sel2);
        if (!r) throw new Error(`Pixiv: Visible to (x_restrict=${pixivVisibility}) radio が見つかりません`);
        r.click();
      },
      settleMs: 200,
    },
    {
      // AI-generated work (ai_type) も必須。 Settings.pixivAiType 経由で切替。
      // 'notAiGenerated' (default) / 'aiGenerated' (AI artist 用)。
      name: 'set-ai-flag',
      action: async () => {
        const { pixivAiType } = await getSettings();
        const sel2 = pixivAiType === 'aiGenerated' ? sel.aiTypeYes : sel.aiTypeNo;
        const r = document.querySelector<HTMLInputElement>(sel2);
        if (!r) throw new Error(`Pixiv: AI-generated work (ai_type=${pixivAiType}) radio が見つかりません`);
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
    {
      // Pixiv は時々 "Security check" / captcha section を出して bottom Post を
      // disabled のまま放置する (dummy 垢 / 新規 session で発生)。 完全な
      // 自動突破は困難 (reCAPTCHA や類似) なので、 「Tutti が代わりに完了する」
      // のではなく「user に banner で完了を促し、 enable 化したら投稿続行」 の
      // semi-auto fallback に倒す。 5 分以内に完了されなければ timeout エラー。
      name: 'await-security-check-if-needed',
      action: async () => {
        if (dryRun) return; // dry-run では post button click しないので security check も不要
        const isPostDisabled = (): boolean => {
          const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
          const bottoms = btns.filter((b) =>
            /^Post$|^投稿$/.test((b.textContent ?? '').trim()) &&
            !b.className.includes('gtm-work-post-button-in-header-click'),
          );
          return bottoms.length > 0 && bottoms.every((b) => b.disabled);
        };
        const hasSecurityCheck = (): boolean => {
          const text = document.body?.innerText ?? '';
          return /Security check|セキュリティチェック|reCAPTCHA/i.test(text);
        };
        // 200ms 程度 React state 反映を待つ (radio click 後)
        await new Promise((r) => setTimeout(r, 200));
        if (!isPostDisabled() || !hasSecurityCheck()) return;

        // banner overlay 注入 (既存があれば再利用)
        let banner = document.getElementById('tutti-pixiv-security-banner');
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'tutti-pixiv-security-banner';
          banner.style.cssText = [
            'position:fixed', 'top:16px', 'left:50%', 'transform:translateX(-50%)',
            'z-index:99999', 'background:#fef3c7', 'color:#92400e', 'padding:12px 20px',
            'border-radius:8px', 'font-weight:600', 'box-shadow:0 4px 12px rgba(0,0,0,0.25)',
            'font-family:system-ui,-apple-system,sans-serif', 'font-size:14px', 'max-width:560px',
            'line-height:1.5', 'border:1px solid #fbbf24',
          ].join(';');
          document.body.appendChild(banner);
        }
        banner.textContent = '⚠ Tutti: Pixiv のセキュリティチェックを完了してください。 完了次第、 自動で投稿します。 / Please complete Pixiv security check; posting will resume automatically.';

        const deadline = Date.now() + 5 * 60 * 1000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1000));
          if (!isPostDisabled()) {
            banner.textContent = '✓ Security check OK、 投稿継続中... / Posting...';
            setTimeout(() => banner.remove(), 2000);
            return;
          }
        }
        banner.textContent = '✗ Tutti: Security check が 5 分以内に完了されませんでした';
        throw new Error('Pixiv: Security check が 5 分以内に完了しませんでした (user 待機 timeout)');
      },
      settleMs: 100,
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

  // dryRun でなければ Pixiv が /artworks/<id> もしくは /users/<id> に redirect
  // するのを待つ (= 「本当の完了」)。timeout なら error 扱い。
  let url: string | undefined;
  if (!dryRun) {
    // v0.5.7: redirect 検知失敗時に throw しない (実投稿は landing しているケースあり)
    const captured = await waitForPostUrl([
      /^https:\/\/(?:www\.)?pixiv\.net\/[a-z]+\/artworks\/\d+/,
      /^https:\/\/(?:www\.)?pixiv\.net\/artworks\/\d+/,
      /^https:\/\/(?:www\.)?pixiv\.net\/[a-z]+\/users\/\d+/,
      /^https:\/\/(?:www\.)?pixiv\.net\/users\/\d+/,
    ], 30000);
    if (captured) url = captured;
  }

  return {
    type: 'POST_RESULT',
    platform: 'pixiv',
    success: true,
    url,
  };
}
