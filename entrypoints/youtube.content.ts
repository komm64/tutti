import { log } from '../src/utils/logger';
import type {
  ImageAttachment,
  PostImplementationPath,
  PostResultMessage,
} from '../src/messages';
import {
  YOUTUBE_SELECTORS,
  buildYouTubeTitle,
  hasYouTubeDailyUploadLimit,
} from '../src/adapters/youtube';
import { executeMultiStepFlow, type Step } from '../src/utils/step-runner';
import { injectImages, injectTagList, injectTextIntoElement } from '../src/utils/image';
import {
  waitForCondition,
  waitForElement,
  waitForStableEditableText,
} from '../src/utils/dom';
import { extractHashtags } from '../src/utils/hashtags';
import { resolveSelectors } from '../src/utils/selector-overrides';
import { bootstrapContentScript } from '../src/utils/content-script-bootstrap';
import { t } from '../src/utils/i18n';
import { clickElementWithPacing } from '../src/utils/web-action-pacing';

/**
 * YouTube logged-in user 検出 (v0.4.98 改善)。
 *
 * **Studio (`studio.youtube.com`) のみに限定**。 通常 youtube.com の home /
 * 視聴ページには `[class*="channel-name"]` にマッチする要素が feed の推奨動画
 * 由来でいくつも存在し、 「first match wins」 で他チャンネル名を拾ってしまう
 * (= 「全然違う人の名前が出る」 bug の典型)。
 *
 * 旧コードは `ytcp-account-info` の textContent を取っていたが、 これは
 * 「Account」 という汎用 label text を返すケースが多かった (channel 名は
 * shadow DOM や nested avatar img alt に入ってる)。 多段 strategy に変更:
 *   1. `ytcp-account-chip-renderer` の text
 *   2. avatar `<img>` の alt (channel name が入ってる)
 *   3. button の aria-label (Studio の account button)
 *   4. fallback: `ytcp-account-info` の text (旧 path、 last resort)
 * いずれも 'Account' / 'アカウント' / 空 は reject。
 */
function detectYouTubeUser(): string | null {
  if (!/(^|\.)studio\.youtube\.com$/.test(location.hostname)) return null;

  const RESERVED_LABELS = new Set([
    'account', 'アカウント', '账户', '계정',
    'channel', 'チャンネル', '频道', '채널',
    'profile', 'profil',
  ]);
  const isLikely = (s: string | null | undefined): s is string => {
    if (!s) return false;
    const t = s.trim();
    if (t.length < 1 || t.length > 80) return false;
    if (RESERVED_LABELS.has(t.toLowerCase())) return false;
    return true;
  };

  // 1) ytcp-account-chip-renderer の text (Studio top-right の account chip)
  const chipText = document.querySelector('ytcp-account-chip-renderer')?.textContent?.trim();
  if (isLikely(chipText)) return chipText;

  // 2) account widget 内の avatar img alt (channel 名が入ってる UI variant)
  const accountInfo = document.querySelector('ytcp-account-info');
  const avatarAlt = accountInfo?.querySelector<HTMLImageElement>('img[alt]')?.getAttribute('alt')?.trim();
  if (isLikely(avatarAlt)) return avatarAlt;

  // 3) account button の aria-label (Studio button)
  const accountBtn = document.querySelector<HTMLElement>(
    'ytcp-account-button[aria-label], button[id="avatar-btn"][aria-label]',
  );
  const btnAria = accountBtn?.getAttribute('aria-label')?.trim();
  // aria-label は "Account menu" / "<Name>'s account" 等の形が来る。
  // "Account" を含むだけでなく channel 名も含むケースを許容。
  if (btnAria) {
    // 「<name>」 形式 / 「<name>'s account」 / 「<name> - チャンネル」 等を抽出
    const cleaned = btnAria
      .replace(/['’]s\s+(account|channel|チャンネル)$/i, '')
      .replace(/(account|channel|チャンネル)\s*[-—:]\s*/i, '')
      .trim();
    if (isLikely(cleaned)) return cleaned;
  }

  // 4) last resort: ytcp-account-info の textContent。 ただし 「Account」 単独は
  // RESERVED_LABELS で reject される (旧 bug 原因)
  const text = accountInfo?.textContent?.trim();
  if (isLikely(text)) return text;

  return null;
}

export default defineContentScript({
  matches: ['https://*.youtube.com/*', 'https://youtube.com/*'],
  main: () => bootstrapContentScript({
    platform: 'youtube',
    selectors: YOUTUBE_SELECTORS,
    detectUser: detectYouTubeUser,
    runPost,
  }),
});

async function runPost(
  text: string,
  images?: ImageAttachment[],
  dryRun?: boolean,
  _textChunks?: string[],
  implementationPath?: PostImplementationPath,
): Promise<PostResultMessage> {
  log.info(`YouTube runPost: dryRun=${dryRun} media=${images?.length ?? 0}`);
  const video = images?.find((m) => m.type.startsWith('video/'));
  if (!video) {
    throw new Error(t('runtimeYouTubeVideoRequired'));
  }
  const sel = await resolveSelectors('youtube', YOUTUBE_SELECTORS);
  const title = buildYouTubeTitle(text);

  const steps: Step[] = [
    {
      // YouTube Studio の "Upload videos" ボタン (id="upload-button" or
      // aria-label="Upload videos") を直接 click。Create メニュー経由は不要。
      name: 'open-upload-modal',
      action: async () => {
        assertNoYouTubeDailyUploadLimit();
        if (document.querySelector(sel.fileInput)) return;
        // Studio can take more than 15 seconds to rebuild its dashboard after
        // the previous upload wizard closes, especially late in a multi-SNS
        // video request. Keep this inside the video platform budget and wait
        // for the actual button rather than ignoring the first wait result.
        let uploadBtn = await waitForCondition<HTMLElement>(
          findYouTubeUploadButton,
          { timeoutMs: 45_000, intervalMs: 250 },
        );
        if (!uploadBtn) {
          // Some Studio variants expose only the persistent Create button.
          // Open its menu, then resolve the same Upload videos command there.
          const createBtn = findYouTubeCreateButton();
          if (createBtn) {
            await clickElementWithPacing(createBtn);
            uploadBtn = await waitForCondition<HTMLElement>(
              findYouTubeUploadButton,
              { timeoutMs: 10_000, intervalMs: 200 },
            );
          }
        }
        if (!uploadBtn) {
          throw new Error(t('runtimeYouTubeUploadButtonMissing'));
        }
        await clickElementWithPacing(uploadBtn);
        await waitForElement<HTMLElement>(sel.fileInput, 10000);
      },
      settleMs: 1500,
      waitAfterAction: async () => {},
    },
    {
      name: 'inject-video',
      action: async () => {
        await injectImages([video], sel.fileInput, { implementationPath });
      },
      settleMs: 200,
      waitAfterAction: async () => {},
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
        await waitForCondition<boolean>(() => {
          assertNoYouTubeDailyUploadLimit();
          textboxes = Array.from(document.querySelectorAll<HTMLElement>(
            'div[id="textbox"][contenteditable="true"]',
          ));
          return textboxes.length >= 2 ? true : null;
        }, { timeoutMs: 60_000, intervalMs: 1000 });
        if (textboxes.length < 1) {
          throw new Error(t('runtimeYouTubeTitleMissing'));
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
      waitAfterAction: async () => {
        await waitForStableEditableText(sel.titleInput, title, {
          timeoutMs: 300,
          quietMs: 75,
          intervalMs: 25,
        });
      },
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
      waitAfterAction: async () => {
        await waitForStableEditableText(sel.descriptionEditor, text, {
          timeoutMs: 300,
          quietMs: 75,
          intervalMs: 25,
        });
      },
    },
    // v0.4.72: tags chip 入力。 YouTube Studio Details ページの "Show more" 下に
    // 隠れている tags field を展開して、 本文の #hashtag を抽出して commit。
    // tags は SEO の主役 (短尺発見性に直結)。 best-effort で、 失敗時は skip。
    {
      name: 'fill-tags',
      action: async () => {
        const tags = extractHashtags(text, { maxCount: 30, maxLen: 100 });
        if (tags.length === 0) {
          log.info('YouTube: 抽出 hashtag なし、 tags step skip');
          return;
        }
        // "Show more" を click して隠し field を展開 (既に展開済なら no-op に近い)
        try {
          const showMore = document.querySelector<HTMLElement>(sel.showMoreButton);
          if (showMore) {
            const txt = (showMore.textContent ?? '').trim().toLowerCase();
            // "Show more" や "Show less" 両方マッチするので、 textContent で
            // "more" 系のときだけ click (展開済の "less" 状態だと click しない)
            if (/more|もっと/i.test(txt)) {
              await clickElementWithPacing(showMore);
            }
          }
        } catch (e) {
          log.warn(`YouTube: Show more click 失敗 (続行): ${e instanceof Error ? e.message : String(e)}`);
        }
        const tagEl = await waitForElement<HTMLInputElement>(sel.tagInput, 5000);
        if (!tagEl) {
          log.warn('YouTube: tags input が見つからず skip');
          return;
        }
        try {
            await injectTagList(tags, sel.tagInput, { implementationPath });
          log.info(`YouTube: ${tags.length} 個の tag を chip 化`);
        } catch (e) {
          log.warn(`YouTube: tag commit 失敗: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
      settleMs: 300,
      waitAfterAction: async () => {},
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
          throw new Error(t('runtimeYouTubeKidsRadioMissing'));
        }
        await clickElementWithPacing(radio);
      },
      settleMs: 500,
      waitAfterAction: async () => {
        await waitForSelectedYouTubeRadio(sel.notMadeForKidsRadio, 500);
      },
      // Next ボタンを click して次の wizard step (Video elements) へ
      advance: {
        finder: findEnabledYouTubeNextButton,
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
        finder: findEnabledYouTubeNextButton,
        timeoutMs: 20000,
      },
      awaitNextDom: { selector: 'ytcp-button-shape', timeoutMs: 15000 },
    },
    {
      name: 'advance-checks',
      action: async () => { /* no-op */ },
      settleMs: 200,
      advance: {
        finder: findEnabledYouTubeNextButton,
        timeoutMs: 20000,
      },
      awaitNextDom: { selector: 'tp-yt-paper-radio-button[name="PUBLIC"], tp-yt-paper-radio-button', timeoutMs: 15000 },
    },
    {
      // Visibility 段階。Tutti は cross-post なので default Public を選択。
      // Private や Unlisted を使いたい場合は YouTube 側で後から変更する想定
      // (Tutti の本旨は「全 SNS に投げる」なので Public が標準)。
      name: 'set-public',
      action: async () => {
        // Public radio を待つ (Visibility step の DOM mount 待ち)
        const publicRadio = await waitForCondition<HTMLElement>(() => {
          assertNoYouTubeDailyUploadLimit();
          const direct = document.querySelector<HTMLElement>(sel.publicVisibilityRadio);
          if (direct) return direct;
          // text fallback: aria-label / textContent で "Public" / "公開" を探す
          return Array.from(document.querySelectorAll<HTMLElement>('tp-yt-paper-radio-button, [role="radio"]'))
            .find((r) => /^(Public|公開)$/.test((r.textContent ?? '').trim().split('\n')[0]?.trim() ?? '')) ?? null;
        }, { timeoutMs: 10_000, intervalMs: 500 });
        if (!publicRadio) {
          throw new Error(t('runtimeYouTubePublicRadioMissing'));
        }
        await clickElementWithPacing(publicRadio);
      },
      settleMs: 500,
      waitAfterAction: async () => {
        await waitForSelectedYouTubeRadio(sel.publicVisibilityRadio, 500);
      },
    },
  ];

  await executeMultiStepFlow({
    steps,
    finalize: {
      finder: findYouTubePublishButton,
      texts: ['Publish', 'Save', '公開', '保存'],
      // v0.5.11〜 YouTube は自動 content check (copyright / safety) が間に合わない
      // 動画 (実写 / 長尺 / 音楽あり) で Publish click 直後に確認 dialog を出す:
      //   "We're still checking your content / We recommend keeping your content
      //    private until checks complete. If you publish now, you may get a strike..."
      // 各 locale で primary button のテキストを多変種で当て、 dialog scope 内
      // (maybeConfirmDialog は [role="dialog"] / ytcp-dialog 配下のみ探索) で押す。
      confirmDialogButtonTexts: [
        'Publish', 'Publish anyway', 'Continue', 'Got it',
        '公開', 'このまま公開', '続行', '了解',
      ],
      // YouTube の server-side checks dialog は遅れて出ることがある。
      // 通常 SNS より長く待ち、確認を取りこぼさない。
      confirmDialogGraceMs: 8000,
      timeoutMs: 30000,
      afterClickDelayMs: 250,
      allowDisabledInPreview: true,
    },
    dryRun,
    implementationPath,
  });

  // dryRun でなければ Studio が channel content listing もしくは個別 video
  // URL に navigate するのを待つ (= 「本当の完了」)。
  let url: string | undefined;
  if (!dryRun) {
    const captured = await waitForYouTubePostUrlOrCompletion();
    // Studio の一部 UI variant は publish 完了後も dashboard に留まる。
    // background が dashboard の Latest Short link から公開 URL を補完する。
    if (captured) url = captured;
  }

  return {
    type: 'POST_RESULT',
    platform: 'youtube',
    success: true,
    url,
  };
}

function findYouTubePublishButton(): HTMLElement | null {
  assertNoYouTubeDailyUploadLimit();
  const selectors = [
    '#done-button',
    '#done-button button',
    'ytcp-button#done-button',
    'ytcp-button[aria-label*="Publish" i]',
    'ytcp-button[aria-label*="Save" i]',
    'ytcp-button[aria-label*="公開" i]',
    'ytcp-button[aria-label*="保存" i]',
  ];
  const selectorMatches = selectors.flatMap((selector) => (
    Array.from(document.querySelectorAll<HTMLElement>(selector))
  ));
  const textMatches = Array.from(document.querySelectorAll<HTMLElement>('button, ytcp-button'))
    .filter((b) => {
      const text = getButtonLabel(b);
      return /^Publish$|^Save$|^公開$|^保存$/i.test(text);
    });
  const buttons = uniqueElements([...selectorMatches, ...textMatches]);
  return buttons.find((button) => !isDisabledButton(button)) ?? buttons[0] ?? null;
}

function findYouTubeUploadButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#upload-button') ??
    document.querySelector<HTMLElement>('#upload-icon') ??
    document.querySelector<HTMLElement>('[aria-label="Upload videos"]') ??
    document.querySelector<HTMLElement>('[aria-label="動画をアップロード"]') ??
    Array.from(document.querySelectorAll<HTMLElement>(
      'button, ytcp-button, ytcp-icon-button, [role="button"]',
    )).find((button) => (
      /^Upload videos$|^動画をアップロード$/.test(getButtonLabel(button))
    )) ?? null;
}

function findYouTubeCreateButton(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(
    'button, ytcp-button, ytcp-icon-button, [role="button"]',
  )).find((button) => (
    /^Create$|^作成$/.test(getButtonLabel(button)) && !isDisabledButton(button)
  )) ?? null;
}

async function waitForSelectedYouTubeRadio(
  selector: string,
  timeoutMs: number,
): Promise<void> {
  await waitForCondition<HTMLElement>(() => {
    const radio = document.querySelector<HTMLElement>(selector);
    if (!radio) return null;
    return radio.getAttribute('aria-checked') === 'true' ||
      radio.hasAttribute('checked')
      ? radio
      : null;
  }, { timeoutMs, intervalMs: 25 });
}

function findEnabledYouTubeNextButton(): HTMLElement | null {
  assertNoYouTubeDailyUploadLimit();
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, ytcp-button'))
    .filter((button) => /^Next$|^次へ$/i.test((button.textContent ?? '').trim()));
  return buttons.find((button) => !isDisabledButton(button)) ?? null;
}

function assertNoYouTubeDailyUploadLimit(): void {
  const pageText = document.body?.innerText ?? document.documentElement?.textContent ?? '';
  if (hasYouTubeDailyUploadLimit(pageText)) {
    throw new Error(t('runtimeYouTubeDailyUploadLimitReached'));
  }
}

function getButtonLabel(el: HTMLElement): string {
  return (
    el.getAttribute('aria-label') ??
    el.textContent ??
    ''
  ).replace(/\s+/g, ' ').trim();
}

function isDisabledButton(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled === true ||
    el.getAttribute('aria-disabled') === 'true' ||
    el.hasAttribute('disabled');
}

function uniqueElements<T extends Element>(elements: T[]): T[] {
  const seen = new Set<T>();
  return elements.filter((element) => {
    if (seen.has(element)) return false;
    seen.add(element);
    return true;
  });
}

/**
 * Publish 後の Studio wizard が閉じるまで待つ。
 * Studio 内 URL は公開 URL ではないため、wizard 終了後に background が
 * dashboard の Latest Short から watch URL を補完する。
 */
async function waitForYouTubePostUrlOrCompletion(timeoutMs = 30_000): Promise<string | null> {
  const captured = await waitForCondition<string | true>(() => {
    assertNoYouTubeDailyUploadLimit();
    const href = location.href;
    if (/^https:\/\/(?:www\.)?youtube\.com\/(?:watch\?v=|shorts\/)[\w-]+/.test(href)) {
      return href;
    }
    const dialog = document.querySelector(
      'ytcp-uploads-dialog, ytcp-video-upload-dialog, ytcp-dialog, ' +
      'tp-yt-paper-dialog[opened], [role="dialog"]',
    );
    if (!dialog) return true;
    return null;
  }, { timeoutMs, intervalMs: 250 });
  if (typeof captured === 'string') return captured;
  return null;
}
