import { initLogLevelFromSettings, log } from '../src/utils/logger';
import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { TIKTOK_SELECTORS, buildTikTokCaption } from '../src/adapters/tiktok';
import { executeMultiStepFlow, type Step } from '../src/utils/step-runner';
import { injectImages, injectTextIntoElement } from '../src/utils/image';
import { sleep, waitForElement } from '../src/utils/dom';
import { buildDiagnosis } from '../src/utils/diagnose';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { detectAndReportUser } from '../src/utils/user-detect';

/**
 * TikTok のログイン中ユーザー検出。header の avatar / username 表示から拾う。
 */
function detectTikTokUser(): string | null {
  const RESERVED = new Set(['login', 'logout', 'settings', 'help', 'studio', 'tiktokstudio']);
  // /@username パターンを持つ anchor
  const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/@"]');
  for (const a of links) {
    const m = a.getAttribute('href')?.match(/\/@([\w.-]{2,30})/);
    if (m && m[1] && !RESERVED.has(m[1].toLowerCase())) return '@' + m[1];
  }
  // data-e2e attribute (TikTok の test id 慣習)
  const userEl = document.querySelector<HTMLElement>('[data-e2e*="profile-username" i], [data-e2e*="username" i]');
  const txt = userEl?.textContent?.trim();
  if (txt && txt.length > 0 && txt.length <= 30) return txt;
  return null;
}

export default defineContentScript({
  matches: ['https://www.tiktok.com/*', 'https://tiktok.com/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type === 'DIAGNOSE_PLATFORM' && msg.platform === 'tiktok') {
        sendResponse(buildDiagnosis('tiktok', TIKTOK_SELECTORS, detectTikTokUser));
        return true;
      }
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'tiktok') return;

      void runPost(msg.text, msg.images, msg.dryRun)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'tiktok',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    void detectAndReportUser('tiktok', detectTikTokUser);
    void initLogLevelFromSettings();
    log.info('TikTok content script ready');
  },
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

  return {
    type: 'POST_RESULT',
    platform: 'tiktok',
    success: true,
  };
}
