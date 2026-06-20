import type { ImageAttachment } from '../messages';
import {
  elementTextMatches,
  findClickableByText,
  sleep,
  waitForCondition,
  waitForElement,
} from './dom';
import { dropImages, injectImages, injectTextIntoElement } from './image';
import { t } from './i18n';
import {
  markPostStepCompleted,
  markPostStepStarted,
  markPostSubmissionStarted,
} from './post-submission-state';

const VIDEO_POST_BUTTON_TIMEOUT_MS = 120_000;
const CONFIRM_DIALOG_SELECTORS = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '.modal-root__container', // Mastodon
  '.components-modal__frame', // Gutenberg / Tumblr
  'ytcp-dialog', // YouTube Studio custom dialog (role="dialog" も付くが念のため)
  'tp-yt-paper-dialog', // YouTube Studio polymer dialog
];

export interface ConfirmDialogOptions {
  /**
   * Compose 本体も role=dialog の SNS があるため、post click 前から存在していた
   * dialog は確認 dialog として扱わない。
   */
  ignoredDialogs?: readonly HTMLElement[];
  /** click した元の submit button を confirmation 候補から除外する。 */
  excludedButtons?: readonly HTMLElement[];
  /** Compose 本体 dialog を除外するための入力欄 selector。 */
  composeInputSelector?: string;
}

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
      await sleep(300);
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
    if (postButtonFinder) return postButtonFinder();
    if (postButtonSelector) {
      let firstSelectorMatch: HTMLElement | null = null;
      for (const part of postButtonSelector.split(',').map((s) => s.trim()).filter(Boolean)) {
        for (const el of document.querySelectorAll<HTMLElement>(part)) {
          firstSelectorMatch ??= el;
          if (!isDisabled(el)) return el;
        }
      }
      if (firstSelectorMatch) return firstSelectorMatch;
    }
    if (postButtonTexts && postButtonTexts.length > 0) {
      return findClickableByText(postButtonTexts);
    }
    return null;
  };

  // ボタンの「存在 + enabled」を **両方満たす** まで loop で待つ。
  // 旧コードは存在だけ確認 → 即 disabled チェック → throw だったので、
  // メディアアップロード処理中 (例: Bluesky CDN への 50MB+ 動画 upload) で
  // 数秒待てば enabled になるケースまで弾いていた。
  // 動画ありの場合は upload 完了に時間が掛かるので timeout を多めに延長
  // (caller が postButtonTimeoutMs に明示値を渡していなければ default 15s、
  //  動画 attachment があれば 120s に bump)。
  const isDisabled = (b: HTMLElement) =>
    b.getAttribute('aria-disabled') === 'true' || (b as HTMLButtonElement).disabled;
  const hasVideo = (images ?? []).some((m) => m.type.startsWith('video/'));
  const effectiveTimeoutMs = resolvePostButtonTimeoutMs(postButtonTimeoutMs, hasVideo);
  const acceptsDisabledPreviewButton = dryRun && allowDisabledPostButtonInPreview === true;

  markPostStepStarted('wait-submit');
  let lastFound: HTMLElement | null = null;
  const button = await waitForCondition<HTMLElement>(() => {
    const candidate = findButton();
    if (candidate) {
      lastFound = candidate;
      if (!isDisabled(candidate) || acceptsDisabledPreviewButton) {
        return candidate;
      }
    }
    return null;
  }, { timeoutMs: effectiveTimeoutMs, intervalMs: 300 });
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
  markPostStepCompleted('wait-submit');

  if (dryRun) {
    const disabledNote = isDisabled(button) ? ' (disabled accepted for preview)' : ' and enabled';
    console.log(`[Tutti] dry-run: post button found${disabledNote}, skipping click`, button);
    // 視覚的にハイライトして検証しやすく
    const orig = button.style.outline;
    button.style.outline = '3px dashed #f59e0b';
    setTimeout(() => { button!.style.outline = orig; }, 5000);
    return;
  }

  const preClickDialogs = collectConfirmDialogs();
  markPostSubmissionStarted();
  if (clickPostButton) await clickPostButton();
  else button.click();

  if (confirmDialogButtonTexts && confirmDialogButtonTexts.length > 0) {
    markPostStepStarted('complete-confirmation');
    await maybeConfirmDialog(confirmDialogButtonTexts, confirmDialogGraceMs, {
      ignoredDialogs: preClickDialogs,
      excludedButtons: [button],
      composeInputSelector: textareaSelector,
    });
    markPostStepCompleted('complete-confirmation');
  }

  markPostStepStarted('post-processing');
  await sleep(afterClickDelayMs);
  markPostStepCompleted('post-processing');
}

async function attachMedia(
  images: ImageAttachment[],
  options: Pick<PostFlowOptions,
    'fileInputSelector' |
    'dropTargetSelector' |
    'requireMediaAccepted' |
    'requireMediaPreview' |
    'beforeDropDelayMs' |
    'mediaAttachOrder'
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
        });
        return;
      }
      if (strategy === 'drop' && options.dropTargetSelector) {
        await dropImages(images, options.dropTargetSelector, {
          requireMediaAccepted: options.requireMediaAccepted,
          requireMediaPreview: options.requireMediaPreview,
          beforeDropDelayMs: options.beforeDropDelayMs,
        });
        return;
      }
    } catch (e) {
      lastError = e;
      if (!isMissingAttachTargetError(e)) throw e;
      console.warn(
        `[Tutti] media attach ${strategy} target missing; trying next strategy: ` +
        `${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (lastError) throw lastError;
  throw new Error(t('runtimeImageUnsupported'));
}

function isMissingAttachTargetError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /(?:file input|drop target) not found/i.test(msg);
}

export function resolvePostButtonTimeoutMs(postButtonTimeoutMs: number, hasVideo: boolean): number {
  return hasVideo ? Math.max(postButtonTimeoutMs, VIDEO_POST_BUTTON_TIMEOUT_MS) : postButtonTimeoutMs;
}

function findComposeInput(selector: string | undefined): HTMLElement | null {
  return selector ? document.querySelector<HTMLElement>(selector) : null;
}

/**
 * 投稿ボタン押下後に出る確認ダイアログのボタンを自動クリックする。
 * モーダル系の標準的なコンテナ内に限って探索する(本体の "Post" 等と被らないように)。
 * v0.5.11〜 deadline は 8s に延長 (YouTube の "still checking" dialog が出るまで
 *   server-side validation の round trip があり、 3s では取りこぼすケースを確認)。
 *
 * step-runner.ts の finalize からも再利用するため export してある。
 */
export async function maybeConfirmDialog(
  texts: string[],
  graceMs = 800,
  options: ConfirmDialogOptions = {},
): Promise<boolean> {
  const start = Date.now();
  const ignoredDialogs = new Set(options.ignoredDialogs ?? []);
  const excludedButtons = new Set(options.excludedButtons ?? []);
  let lastSeenDialog: HTMLElement | null = null;
  let lastSeenButtonTexts: string[] = [];
  const confirmed = await waitForCondition<boolean>(() => {
    for (const dialog of collectConfirmDialogs()) {
      if (ignoredDialogs.has(dialog)) continue;
      if (options.composeInputSelector && dialog.querySelector(options.composeInputSelector)) continue;
      lastSeenDialog = dialog;
      // ダイアログ内の button のうち、テキストが完全一致するもの(部分一致だと "Post anyway" が "Post" に弾かれる)
      const buttons = (Array.from(
        dialog.querySelectorAll<HTMLButtonElement>('button, ytcp-button[role="button"], [role="button"]'),
      ) as HTMLElement[]).filter((button) => !excludedButtons.has(button));
      lastSeenButtonTexts = buttons.map((b) => (b.textContent ?? '').trim()).filter((t) => t.length > 0);
      for (const wanted of texts) {
        const target = buttons.find((b) => elementTextMatches(b, [wanted]));
        if (target && !(target as HTMLButtonElement).disabled) {
          console.log(`[Tutti] confirm dialog: clicking "${wanted}"`);
          target.click();
          return true;
        }
      }
    }
    // 通常ケースでは確認 dialog は出ない。短い grace 後に先へ進み、
    // dialog を一度でも見た場合だけ disabled → enabled の変化を最大 8s 待つ。
    if (!lastSeenDialog && Date.now() - start >= graceMs) return true;
    return null;
  }, { timeoutMs: 8000, intervalMs: 150 });
  // dialog が居て texts が全部空振りした場合: auto-triage の手掛かりとして
  // 観測した button text を warn log に残す (CWS / users 側で再現したときに
  // diagnostics で button text が分かるようになる)
  if (lastSeenDialog && lastSeenButtonTexts.length > 0) {
    console.warn(
      `[Tutti] confirm dialog detected but no button matched. ` +
      `Tried: [${texts.join(', ')}]. ` +
      `Saw: [${lastSeenButtonTexts.join(', ')}]`,
    );
  }
  return confirmed === true;
}

function collectConfirmDialogs(): HTMLElement[] {
  const dialogs: HTMLElement[] = [];
  for (const sel of CONFIRM_DIALOG_SELECTORS) {
    dialogs.push(...Array.from(document.querySelectorAll<HTMLElement>(sel)));
  }
  return dialogs.filter((dialog, index, all) => all.indexOf(dialog) === index);
}
