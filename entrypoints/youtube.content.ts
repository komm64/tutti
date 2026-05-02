import { initLogLevelFromSettings, log } from '../src/utils/logger';
import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { YOUTUBE_SELECTORS, buildYouTubeTitle, youtubeAdapter } from '../src/adapters/youtube';
import { executeMultiStepFlow, type Step } from '../src/utils/step-runner';
import { injectImages, injectTextIntoElement } from '../src/utils/image';
import { sleep, waitForElement } from '../src/utils/dom';
import { buildDiagnosis } from '../src/utils/diagnose';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { detectAndReportUser } from '../src/utils/user-detect';

/**
 * YouTube logged-in user 検出。Studio header の channel 名 / Account menu から。
 */
function detectYouTubeUser(): string | null {
  // header の channel name (Studio)
  const channelEl = document.querySelector<HTMLElement>(
    'ytcp-account-info, [id="account-name"], [class*="channel-name" i]',
  );
  const txt = channelEl?.textContent?.trim();
  if (txt && txt.length > 0 && txt.length <= 50) return txt;
  // www.youtube.com の avatar menu
  const avatar = document.querySelector<HTMLElement>('button[aria-label*="account" i] img, #avatar-btn');
  const alt = avatar?.getAttribute('alt') ?? avatar?.getAttribute('aria-label') ?? '';
  if (alt && alt.length > 0) return alt.slice(0, 50);
  return null;
}

export default defineContentScript({
  matches: ['https://*.youtube.com/*', 'https://youtube.com/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type === 'DIAGNOSE_PLATFORM' && msg.platform === 'youtube') {
        sendResponse(buildDiagnosis('youtube', YOUTUBE_SELECTORS, detectYouTubeUser));
        return true;
      }
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'youtube') return;

      void runPost(msg.text, msg.images, msg.dryRun)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'youtube',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    void detectAndReportUser('youtube', detectYouTubeUser);
    void initLogLevelFromSettings();
    log.info('YouTube content script ready');
  },
});

async function runPost(
  text: string,
  images?: ImageAttachment[],
  dryRun?: boolean,
): Promise<PostResultMessage> {
  log.info(`YouTube runPost: dryRun=${dryRun} media=${images?.length ?? 0}`);
  const video = images?.find((m) => m.type.startsWith('video/'));
  if (!video) {
    throw new Error('YouTube は動画必須です (Shorts 用 mp4 等)');
  }
  const sel = await resolveSelectors('youtube', YOUTUBE_SELECTORS);
  const title = buildYouTubeTitle(text);

  const steps: Step[] = [
    {
      // Studio に到達したら Create → Upload を click して file input を出す
      name: 'open-upload-modal',
      action: async () => {
        // 既に file input があれば skip
        if (document.querySelector(sel.fileInput)) return;
        // "Create" ボタン → "Upload videos"
        const createBtn = Array.from(document.querySelectorAll<HTMLElement>('button, ytcp-button, [role="button"]'))
          .find((b) => /^Create$|create video|新規作成|upload/i.test((b.textContent ?? '').trim()));
        if (!createBtn) {
          throw new Error('YouTube: Create ボタンが見つかりません (チャンネル未作成の可能性)');
        }
        createBtn.click();
        await waitForElement<HTMLElement>(sel.fileInput, 8000);
      },
      settleMs: 1500,
    },
    {
      name: 'inject-video',
      action: async () => {
        await injectImages([video], sel.fileInput);
      },
      settleMs: 200,
    },
    {
      // metadata form 出現待ち + title 入力
      name: 'fill-title',
      action: async () => {
        const titleEl = await waitForElement<HTMLElement>(sel.titleInput, 30000);
        if (!titleEl) {
          throw new Error('YouTube: title input が出現しませんでした (upload 失敗?)');
        }
        await injectTextIntoElement(title, sel.titleInput);
      },
      settleMs: 300,
    },
    {
      name: 'fill-description',
      action: async () => {
        await injectTextIntoElement(text, sel.descriptionEditor);
      },
      settleMs: 300,
      // YouTube wizard は Next/Publish の多段。advance で Next click
      advance: {
        finder: () => {
          const btns = Array.from(document.querySelectorAll<HTMLElement>('button, ytcp-button'))
            .filter((b) => /^Next$|^次へ$/i.test((b.textContent ?? '').trim()));
          return btns.find((b) => !(b as HTMLButtonElement).disabled) ?? null;
        },
        timeoutMs: 8000,
      },
      awaitNextDom: { selector: 'ytcp-button-shape', timeoutMs: 10000 },
    },
    // YouTube は通常 4 段 wizard: Details → Video elements → Checks → Visibility
    // 各段で Next を押して進む。child-content radio (required: 子供向けかどうか) は
    // 別 step で扱うべきだが、初期実装では Next で進めて後で改善
    {
      name: 'advance-elements',
      action: async () => { /* no-op */ },
      settleMs: 200,
      advance: {
        finder: () => {
          const btns = Array.from(document.querySelectorAll<HTMLElement>('button, ytcp-button'))
            .filter((b) => /^Next$|^次へ$/i.test((b.textContent ?? '').trim()));
          return btns.find((b) => !(b as HTMLButtonElement).disabled) ?? null;
        },
        timeoutMs: 8000,
      },
      awaitNextDom: { selector: 'ytcp-button-shape', timeoutMs: 10000 },
    },
    {
      name: 'advance-checks',
      action: async () => { /* no-op */ },
      settleMs: 200,
      advance: {
        finder: () => {
          const btns = Array.from(document.querySelectorAll<HTMLElement>('button, ytcp-button'))
            .filter((b) => /^Next$|^次へ$/i.test((b.textContent ?? '').trim()));
          return btns.find((b) => !(b as HTMLButtonElement).disabled) ?? null;
        },
        timeoutMs: 8000,
      },
      awaitNextDom: { selector: 'ytcp-button-shape', timeoutMs: 10000 },
    },
  ];

  await executeMultiStepFlow({
    steps,
    finalize: {
      finder: () => {
        const btns = Array.from(document.querySelectorAll<HTMLElement>('button, ytcp-button'))
          .filter((b) => /^Publish$|^Save$|^公開$|^保存$/i.test((b.textContent ?? '').trim()));
        const enabled = btns.find((b) => !(b as HTMLButtonElement).disabled);
        return enabled ?? btns[0] ?? null;
      },
      texts: ['Publish', 'Save', '公開', '保存'],
      timeoutMs: 30000,
      afterClickDelayMs: 5000,
    },
    dryRun,
  });

  await sleep(500);

  return {
    type: 'POST_RESULT',
    platform: 'youtube',
    success: true,
  };
}
