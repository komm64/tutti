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
      // YouTube Studio の "Upload videos" ボタン (id="upload-button" or
      // aria-label="Upload videos") を直接 click。Create メニュー経由は不要。
      name: 'open-upload-modal',
      action: async () => {
        if (document.querySelector(sel.fileInput)) return;
        // 直接 Upload videos ボタンを探す
        const uploadBtn =
          document.querySelector<HTMLElement>('#upload-button') ??
          document.querySelector<HTMLElement>('[aria-label="Upload videos"]') ??
          Array.from(document.querySelectorAll<HTMLElement>('button, ytcp-button, [role="button"]'))
            .find((b) => /^Upload videos$|^動画をアップロード$/.test((b.textContent ?? '').trim()));
        if (!uploadBtn) {
          throw new Error('YouTube: Upload videos ボタンが見つかりません (Studio にいるか確認、チャンネル未作成?)');
        }
        uploadBtn.click();
        await waitForElement<HTMLElement>(sel.fileInput, 10000);
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
      // metadata form 出現待ち + title 入力。
      // YouTube Studio は title / description どちらも div#textbox contenteditable で
      // 両方とも id="textbox" (invalid HTML だが YouTube の慣習)。aria-label は
      // 言語依存だが必ず存在するので「all #textbox の中で 1 つ目 = title」と扱う。
      name: 'fill-title',
      action: async () => {
        // 60s 待機 (動画 upload + metadata mount 込み)
        let textboxes: HTMLElement[] = [];
        for (let i = 0; i < 60; i++) {
          textboxes = Array.from(document.querySelectorAll<HTMLElement>(
            'div[id="textbox"][contenteditable="true"]',
          ));
          if (textboxes.length >= 2) break;
          await sleep(1000);
        }
        if (textboxes.length < 1) {
          throw new Error('YouTube: title 入力欄が出現しませんでした (upload 失敗 / channel 未作成?)');
        }
        const titleEl = textboxes[0]!;
        // unique selector を生成して inject-helper に渡す
        // (DOM 順を保つため getElementsByTagName で index 取って nth-of-type 風セレクタ)
        // 最もシンプル: 直接 element に focus + paste するため DOM 経路を確保
        // titleEl.id = 'tutti-yt-title-marker';
        // sel.titleInput を上書きできないので ここで直接 inject する代わりに
        // inject-helper の text mode は selector を取るので marker 付ける
        const marker = `tutti-yt-title-${Date.now()}`;
        titleEl.setAttribute('data-tutti-marker', marker);
        await injectTextIntoElement(title, `[data-tutti-marker="${marker}"]`);
      },
      settleMs: 300,
    },
    {
      name: 'fill-description',
      action: async () => {
        const textboxes = Array.from(document.querySelectorAll<HTMLElement>(
          'div[id="textbox"][contenteditable="true"]',
        ));
        if (textboxes.length < 2) {
          // description は optional として skip 可。warn だけ
          log.warn('YouTube: description editor が見つからず skip');
          return;
        }
        const descEl = textboxes[1]!;
        const marker = `tutti-yt-desc-${Date.now()}`;
        descEl.setAttribute('data-tutti-marker', marker);
        await injectTextIntoElement(text, `[data-tutti-marker="${marker}"]`);
      },
      settleMs: 300,
    },
    {
      // Made for Kids 必須選択。Tutti default は "No, it's not 'Made for Kids'"
      // (cross-post content は基本一般向け。明示的子ども向け作品は v0.5+ で
      // settings に切替を expose 予定)。
      // tp-yt-paper-radio-button の click() で aria-checked が更新され
      // YouTube React 側で onChange が走る。
      name: 'set-not-for-kids',
      action: async () => {
        const radio = document.querySelector<HTMLElement>(sel.notMadeForKidsRadio);
        if (!radio) {
          throw new Error('YouTube: "Made for Kids" の No radio が見つかりません');
        }
        radio.click();
      },
      settleMs: 500,
      // Next ボタンを click して次の wizard step (Video elements) へ
      advance: {
        finder: () => {
          const btns = Array.from(document.querySelectorAll<HTMLElement>('button, ytcp-button'))
            .filter((b) => /^Next$|^次へ$/i.test((b.textContent ?? '').trim()));
          return btns.find((b) => !(b as HTMLButtonElement).disabled) ?? null;
        },
        timeoutMs: 10000,
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
        timeoutMs: 20000,
      },
      awaitNextDom: { selector: 'ytcp-button-shape', timeoutMs: 15000 },
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
        timeoutMs: 20000,
      },
      awaitNextDom: { selector: 'ytcp-button-shape', timeoutMs: 15000 },
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
