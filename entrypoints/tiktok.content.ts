import { log } from '../src/utils/logger';
import type { ImageAttachment, PostResultMessage } from '../src/messages';
import { TIKTOK_SELECTORS, buildTikTokCaption } from '../src/adapters/tiktok';
import { executeMultiStepFlow, type Step } from '../src/utils/step-runner';
import { injectImages, injectTextIntoElement } from '../src/utils/image';
import { sleep, waitForElement } from '../src/utils/dom';
import { waitForPostUrl } from '../src/utils/url-capture';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';

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
    throw new Error('TikTok は動画必須です (画像 only は Web upload に未対応)');
  }
  const sel = await resolveSelectors('tiktok', TIKTOK_SELECTORS);
  const caption = buildTikTokCaption(text);

  const steps: Step[] = [
    {
      // 動画 file input に inject。upload が始まり caption form が mount される
      name: 'inject-video',
      action: async () => {
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
          throw new Error('TikTok: caption editor が出現しませんでした (動画 upload 失敗の可能性)');
        }
        await injectTextIntoElement(caption, sel.captionEditor);
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
      afterClickDelayMs: 3000,
    },
    dryRun,
  });

  await sleep(500);

  // dryRun でなければ TikTok Studio が /tiktokstudio/content (= 投稿一覧) へ
  // navigate するのを待つ (= 「本当の完了」)。
  // 個別の post URL (https://www.tiktok.com/@user/video/<id>) は studio 上では
  // 動画 thumbnail 経由でしか取れないので、 listing URL で完了 proof とする。
  let url: string | undefined;
  if (!dryRun) {
    const captured = await waitForPostUrl([
      /^https:\/\/(?:www\.)?tiktok\.com\/tiktokstudio\/content/,
      /^https:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/\d+/,
    ], 60000);
    if (!captured) {
      throw new Error('TikTok: 投稿後 listing / video URL に redirect されませんでした');
    }
    url = captured;
  }

  return {
    type: 'POST_RESULT',
    platform: 'tiktok',
    success: true,
    url,
  };
}
