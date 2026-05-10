import type { ImageAttachment } from '../messages';
import {
  findClickableByText,
  sleep,
  waitForElement,
} from './dom';
import { dropImages, injectImages, injectTextIntoElement } from './image';

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
  /** 投稿後に処理が走る猶予(ms) */
  afterClickDelayMs?: number;
  /**
   * 投稿ボタン押下後に出る確認ダイアログ(Mastodon "Post anyway" / Tumblr "Post" 等)を
   * 自動承認するためのボタンテキスト候補。`[role="dialog"]` 等のモーダル内に限って
   * 探索するので、本体の "Post" 等とは衝突しない。
   */
  confirmDialogButtonTexts?: string[];
  /** dry-run: post button まで見つけるが click はしない */
  dryRun?: boolean;
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
    postButtonTimeoutMs = 8000,
    afterClickDelayMs = 1500,
    confirmDialogButtonTexts,
    dryRun = false,
  } = options;
  if (!postButtonSelector && !postButtonTexts?.length && !postButtonFinder) {
    throw new Error('postButtonSelector / postButtonTexts / postButtonFinder のいずれかが必要');
  }

  if (!prefillsViaUrl) {
    if (!textareaSelector) {
      throw new Error('DOM injection 方式には textareaSelector が必要');
    }
    const textarea = await waitForElement<HTMLElement>(textareaSelector, 8000);
    if (!textarea) {
      throw new Error('投稿入力欄が見つかりませんでした。ログイン済みか確認してください');
    }
    // MAIN world 経由でテキスト挿入(React/Lexical の input listener が
    // ISOLATED world からの execCommand を取りこぼすため)
    await injectTextIntoElement(text, textareaSelector);
    await sleep(300);
  }

  if (images && images.length > 0) {
    if (dropTargetSelector) {
      await dropImages(images, dropTargetSelector);
    } else if (fileInputSelector) {
      await injectImages(images, fileInputSelector);
    } else {
      throw new Error('このプラットフォームは画像添付に未対応です');
    }
  }

  // post button 探索: finder > selector > texts の順で優先。
  // selector はカンマ区切りを **左から順に** 試す(querySelector の comma 動作は
  // DOM 順で先勝ちなので、scope の好みを表せない)。X のように modal と
  // homepage 両方に同じ data-testid のボタンが存在するケースでは、左 = dialog scope を
  // 先に書くことで modal を優先できる。
  const findButton = (): HTMLElement | null => {
    if (postButtonFinder) return postButtonFinder();
    if (postButtonSelector) {
      for (const part of postButtonSelector.split(',').map((s) => s.trim()).filter(Boolean)) {
        const el = document.querySelector<HTMLElement>(part);
        if (el) return el;
      }
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
  // (caller が postButtonTimeoutMs に明示値を渡していなければ default 8s、
  //  動画 attachment があれば 120s に bump)。
  const isDisabled = (b: HTMLElement) =>
    b.getAttribute('aria-disabled') === 'true' || (b as HTMLButtonElement).disabled;
  const hasVideo = (images ?? []).some((m) => m.type.startsWith('video/'));
  const effectiveTimeoutMs = postButtonTimeoutMs >= 30000
    ? postButtonTimeoutMs
    : (hasVideo ? Math.max(postButtonTimeoutMs, 120000) : postButtonTimeoutMs);

  let button: HTMLElement | null = null;
  let lastFound: HTMLElement | null = null;
  const findStart = Date.now();
  while (Date.now() - findStart < effectiveTimeoutMs) {
    const candidate = findButton();
    if (candidate) {
      lastFound = candidate;
      if (!isDisabled(candidate)) {
        button = candidate;
        break;
      }
    }
    await sleep(300);
  }
  if (!button) {
    if (!lastFound) {
      throw new Error(
        '投稿ボタンが見つかりませんでした。SNS の UI が更新された可能性があります(Tutti の更新が必要)',
      );
    }
    throw new Error(
      'まだ投稿できる状態になっていません(文字数オーバー / メディア処理中 / 未ログインの可能性)',
    );
  }

  if (dryRun) {
    console.log('[Tutti] dry-run: post button found and enabled, skipping click', button);
    // 視覚的にハイライトして検証しやすく
    const orig = button.style.outline;
    button.style.outline = '3px dashed #f59e0b';
    setTimeout(() => { button!.style.outline = orig; }, 5000);
    return;
  }

  button.click();

  if (confirmDialogButtonTexts && confirmDialogButtonTexts.length > 0) {
    await maybeConfirmDialog(confirmDialogButtonTexts);
  }

  await sleep(afterClickDelayMs);
}

/**
 * 投稿ボタン押下後に出る確認ダイアログのボタンを自動クリックする。
 * モーダル系の標準的なコンテナ内に限って探索する(本体の "Post" 等と被らないように)。
 * 最大 3 秒待機。見つからなければ何もせず戻る。
 *
 * step-runner.ts の finalize からも再利用するため export してある。
 */
export async function maybeConfirmDialog(texts: string[]): Promise<void> {
  const DIALOG_SELECTORS = [
    '[role="dialog"]',
    '[role="alertdialog"]',
    '.modal-root__container', // Mastodon
    '.components-modal__frame', // Gutenberg / Tumblr
  ];
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    for (const sel of DIALOG_SELECTORS) {
      const dialog = document.querySelector<HTMLElement>(sel);
      if (!dialog) continue;
      // ダイアログ内の button のうち、テキストが完全一致するもの(部分一致だと "Post anyway" が "Post" に弾かれる)
      const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'));
      for (const wanted of texts) {
        const target = buttons.find((b) => (b.textContent ?? '').trim() === wanted);
        if (target && !target.disabled) {
          console.log(`[Tutti] confirm dialog: clicking "${wanted}"`);
          target.click();
          return;
        }
      }
    }
    await sleep(150);
  }
}
