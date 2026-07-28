import type { ImageAttachment } from '../messages';
import type { PostImplementationPath } from '../messages';
import {
  sleep,
  waitForCondition,
  waitForElement,
  waitForStableEditableText,
} from './dom';
import {
  collectConfirmDialogs,
  finalizeFlow,
  findFlowButton,
  highlightPreviewButton,
  isFlowButtonDisabled,
  waitForSubmitButton,
} from './flow-finalization';
import { dropImages, injectImages, injectTextIntoElement } from './image';
import { t } from './i18n';
import {
  markPostStepCompleted,
  markPostStepStarted,
} from './post-submission-state';

const VIDEO_POST_BUTTON_TIMEOUT_MS = 120_000;

export {
  maybeConfirmDialog,
  type ConfirmDialogOptions,
} from './flow-finalization';

export interface PostFlowOptions {
  /** URL pre-fill 方式なら true、DOM injection が必要なら false */
  prefillsViaUrl: boolean;
  /** DOM injection 方式の場合のみ必須 */
  textareaSelector?: string;
  /** 投稿ボタンの CSS セレクタ(複数候補をカンマ区切りで OK) */
  postButtonSelector?: string;
  /** CSS が外れた場合のテキストベース fallback。"Post" / "投稿" 等 */
  postButtonTexts?: string[];
  /** 完全カスタム finder。指定された場合は selector / texts を無視 */
  postButtonFinder?: () => HTMLElement | null;
  /** 画像添付の file input セレクタ(省略時は画像注入をスキップ) */
  fileInputSelector?: string;
  /**
   * 画像添付に drag & drop を使う SNS (Bluesky / Misskey / Tumblr) の drop target。
   * fileInputSelector との併用は不可。指定された方が優先される。
   */
  dropTargetSelector?: string;
  /** 投稿テキスト */
  text: string;
  /** 添付画像(省略可) */
  images?: ImageAttachment[];
  /** 投稿ボタン待機タイムアウト(ms) */
  postButtonTimeoutMs?: number;
  /** SPA の compose editor 描画待機タイムアウト(ms) */
  composeInputTimeoutMs?: number;
  /** 投稿後に処理が走る猶予(ms) */
  afterClickDelayMs?: number;
  /**
   * 投稿ボタン押下後に出る確認ダイアログ(Mastodon "Post anyway" / Tumblr "Post" 等)を
   * 自動承認するためのボタンテキスト候補。`[role="dialog"]` 等のモーダル内に限って
   * 探索するので、本体の "Post" 等とは衝突しない。
   */
  confirmDialogButtonTexts?: string[];
  /** 確認ダイアログが出始めるまで待つ猶予。遅れて出る SNS のみ長くする。 */
  confirmDialogGraceMs?: number;
  /**
   * text 注入 + image attach 後、 post button click 直前に呼ばれる hook (v0.4.72〜)。
   * tags chip 入力など、 各 SNS 固有の追加 step に使う。 throw すると executePostFlow 全体が失敗。
   */
  beforeSubmit?: () => Promise<void>;
  /** dry-run: post button まで見つけるが click はしない */
  dryRun?: boolean;
  /** SNS 固有の本文注入が必要な場合に差し替える */
  textInjector?: (text: string, selector: string) => Promise<void>;
  /** framework が MAIN world の click のみ受理する場合の submit hook */
  clickPostButton?: () => Promise<void>;
  /** upload request または compose preview で media 受理を確認する */
  requireMediaAccepted?: boolean;
  /** compose preview が出るまで media 注入成功扱いにしない */
  requireMediaPreview?: boolean;
  /** drag/drop 型の添付で、drop target 出現後に待つ時間(ms) */
  beforeDropDelayMs?: number;
  /**
   * Preview-only escape hatch for SNS where an uploaded media preview is valid
   * but the submit button remains disabled until the user adds optional text.
   */
  allowDisabledPostButtonInPreview?: boolean;
  /**
   * media attach strategy order. Default keeps the historical behavior:
   * drop target first when present, otherwise file input.
   */
  mediaAttachOrder?: ('input' | 'drop')[];
  /** 欠落時は配布済みlegacyの固定待機を維持する。 */
  implementationPath?: PostImplementationPath;
}

/**
 * SNS 共通の投稿フロー。URL pre-fill 方式なら post button click だけ、
 * DOM injection 方式なら textarea を見つけて inject してから click する。
 * 画像がある場合は post button click 前に file input に注入する。
 */
export async function executePostFlow(options: PostFlowOptions): Promise<void> {
  const {
    prefillsViaUrl,
    textareaSelector,
    postButtonSelector,
    postButtonTexts,
    postButtonFinder,
    fileInputSelector,
    dropTargetSelector,
    text,
    images,
    postButtonTimeoutMs = 15000,
    composeInputTimeoutMs = 15000,
    afterClickDelayMs = 250,
    confirmDialogButtonTexts,
    confirmDialogGraceMs,
    beforeSubmit,
    dryRun = false,
    textInjector = injectTextIntoElement,
    clickPostButton,
    requireMediaAccepted,
    requireMediaPreview,
    beforeDropDelayMs,
    allowDisabledPostButtonInPreview,
    mediaAttachOrder,
    implementationPath,
  } = options;
  if (!postButtonSelector && !postButtonTexts?.length && !postButtonFinder) {
    throw new Error('postButtonSelector, postButtonTexts, or postButtonFinder is required');
  }

  if (!prefillsViaUrl) {
    const injectSelector = textareaSelector;
    if (!injectSelector) {
      throw new Error('textareaSelector is required for DOM injection');
    }
    markPostStepStarted('verify-compose');
    const composeInput = await waitForElement<HTMLElement>(injectSelector, composeInputTimeoutMs);
    if (!composeInput) {
      throw new Error(t('runtimeComposeInputMissing'));
    }
    markPostStepCompleted('verify-compose');
    // 本文がある場合のみ MAIN world 経由でテキスト挿入。空文字 inject は
    // (一部 framework で) editor の placeholder structure を壊すリスクが
    // あるので skip (画像のみ投稿のための path、v0.4.59)。
    if (text) {
      markPostStepStarted('inject-text');
      await textInjector(text, injectSelector);
      if (implementationPath === 'next') {
        await waitForStableEditableText(injectSelector, text, {
          timeoutMs: 300,
          quietMs: 75,
          intervalMs: 25,
        });
      } else {
        await sleep(300);
      }
      markPostStepCompleted('inject-text');
      markPostStepCompleted('verify-text');
    }
  }

  if (prefillsViaUrl && textareaSelector && images && images.length > 0) {
    markPostStepStarted('verify-compose');
    const composeInput = await waitForElement<HTMLElement>(textareaSelector, composeInputTimeoutMs);
    if (!composeInput) {
      throw new Error(t('runtimeComposeInputMissing'));
    }
    markPostStepCompleted('verify-compose');
  }

  if (images && images.length > 0) {
    markPostStepStarted('attach-media');
    await attachMedia(images, {
      fileInputSelector,
      dropTargetSelector,
      requireMediaAccepted,
      requireMediaPreview,
      beforeDropDelayMs,
      mediaAttachOrder,
      implementationPath,
    });
    markPostStepCompleted('attach-media');
    markPostStepCompleted('verify-media');
  }

  // tag chip 注入など、 各 SNS 固有の追加 step (v0.4.72〜)
  if (beforeSubmit) {
    markPostStepStarted('pre-submit-checks');
    await beforeSubmit();
    markPostStepCompleted('pre-submit-checks');
  }

  if (dryRun && prefillsViaUrl && textareaSelector) {
    markPostStepStarted('verify-compose');
    const composeInput = await waitForCondition<HTMLElement>(
      () => findComposeInput(textareaSelector),
      { timeoutMs: composeInputTimeoutMs, intervalMs: 150 },
    );
    if (composeInput) {
      markPostStepCompleted('verify-compose');
      console.log('[Tutti] dry-run: URL-prefill compose input found, skipping post button check', composeInput);
      if (composeInput.style) {
        const orig = composeInput.style.outline;
        composeInput.style.outline = '3px dashed #f59e0b';
        setTimeout(() => { composeInput.style.outline = orig; }, 5000);
      }
      return;
    }
  }

  // post button 探索: finder > selector > texts の順で優先。
  // selector はカンマ区切りを **左から順に** 試す(querySelector の comma 動作は
  // DOM 順で先勝ちなので、scope の好みを表せない)。X のように modal と
  // homepage 両方に同じ data-testid のボタンが存在するケースでは、左 = dialog scope を
  // 先に書くことで modal を優先できる。
  let sawComposeInput = prefillsViaUrl ? !!findComposeInput(textareaSelector) : true;
  const findButton = (): HTMLElement | null => {
    if (prefillsViaUrl && !sawComposeInput) {
      sawComposeInput = !!findComposeInput(textareaSelector);
    }
    return findFlowButton({
      finder: postButtonFinder,
      selector: postButtonSelector,
      texts: postButtonTexts,
    }, {
      preferEnabledSelectorMatch: true,
    });
  };

  // ボタンの「存在 + enabled」を **両方満たす** まで loop で待つ。
  // 旧コードは存在だけ確認 → 即 disabled チェック → throw だったので、
  // メディアアップロード処理中 (例: Bluesky CDN への 50MB+ 動画 upload) で
  // 数秒待てば enabled になるケースまで弾いていた。
  // 動画ありの場合は upload 完了に時間が掛かるので timeout を多めに延長
  // (caller が postButtonTimeoutMs に明示値を渡していなければ default 15s、
  //  動画 attachment があれば 120s に bump)。
  const hasVideo = (images ?? []).some((m) => m.type.startsWith('video/'));
  const effectiveTimeoutMs = resolvePostButtonTimeoutMs(postButtonTimeoutMs, hasVideo);
  const acceptsDisabledPreviewButton = dryRun && allowDisabledPostButtonInPreview === true;

  const { button, lastFound } = await waitForSubmitButton({
    finder: findButton,
  }, effectiveTimeoutMs, {
    allowDisabled: acceptsDisabledPreviewButton,
    intervalMs: 300,
  });
  if (!button) {
    if (!lastFound) {
      if (prefillsViaUrl && textareaSelector && !sawComposeInput) {
        throw new Error(t('runtimeComposeInputMissing'));
      }
      throw new Error(
        t('runtimePostButtonMissing'),
      );
    }
    throw new Error(
      t('runtimePostButtonDisabled'),
    );
  }

  if (dryRun) {
    const disabledNote = isFlowButtonDisabled(button)
      ? ' (disabled accepted for preview)'
      : ' and enabled';
    highlightPreviewButton(
      button,
      `[Tutti] dry-run: post button found${disabledNote}, skipping click`,
    );
    return;
  }

  const preClickDialogs = collectConfirmDialogs();
  await finalizeFlow({
    button,
    click: clickPostButton,
    confirmDialogButtonTexts,
    confirmDialogGraceMs,
    confirmDialogOptions: {
      ignoredDialogs: preClickDialogs,
      excludedButtons: [button],
      composeInputSelector: textareaSelector,
    },
    afterClickDelayMs: implementationPath === 'next' ? 0 : afterClickDelayMs,
  });
}

async function attachMedia(
  images: ImageAttachment[],
  options: Pick<PostFlowOptions,
    'fileInputSelector' |
    'dropTargetSelector' |
    'requireMediaAccepted' |
    'requireMediaPreview' |
    'beforeDropDelayMs' |
    'mediaAttachOrder' |
    'implementationPath'
  >,
): Promise<void> {
  const defaultOrder: ('input' | 'drop')[] = options.dropTargetSelector
    ? ['drop', 'input']
    : ['input', 'drop'];
  const order = options.mediaAttachOrder ?? defaultOrder;
  let lastError: unknown;

  for (const strategy of order) {
    try {
      if (strategy === 'input' && options.fileInputSelector) {
        await injectImages(images, options.fileInputSelector, {
          requireMediaAccepted: options.requireMediaAccepted,
          requireMediaPreview: options.requireMediaPreview,
          implementationPath: options.implementationPath,
        });
        return;
      }
      if (strategy === 'drop' && options.dropTargetSelector) {
        await dropImages(images, options.dropTargetSelector, {
          requireMediaAccepted: options.requireMediaAccepted,
          requireMediaPreview: options.requireMediaPreview,
          beforeDropDelayMs: options.beforeDropDelayMs,
          implementationPath: options.implementationPath,
        });
        return;
      }
    } catch (e) {
      lastError = e;
      if (!isRecoverableAttachStrategyError(e)) throw e;
      console.warn(
        `[Tutti] media attach ${strategy} did not complete; trying next strategy: ` +
        `${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (lastError) throw lastError;
  throw new Error(t('runtimeImageUnsupported'));
}

function isRecoverableAttachStrategyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /(?:file input|drop target) not found/i.test(msg) ||
    /Timed out while waiting for the media upload or preview/i.test(msg);
}

export function resolvePostButtonTimeoutMs(postButtonTimeoutMs: number, hasVideo: boolean): number {
  return hasVideo ? Math.max(postButtonTimeoutMs, VIDEO_POST_BUTTON_TIMEOUT_MS) : postButtonTimeoutMs;
}

function findComposeInput(selector: string | undefined): HTMLElement | null {
  return selector ? document.querySelector<HTMLElement>(selector) : null;
}
