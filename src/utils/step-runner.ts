/**
 * 多段モーダル / wizard 型 SNS 用の汎用 step runner。
 *
 * 既存の `executePostFlow` (post-flow.ts) は「テキスト注入 → 画像注入 → post button
 * 1 つ」の固定シーケンスで完結する SNS 向け (X / Bluesky / Threads / Mastodon /
 * Misskey / Tumblr)。これに対し Pixiv / DeviantArt / Instagram は wizard 型で:
 *
 *   - Pixiv:      image select → caption → tags → submit       (4 step)
 *   - DeviantArt: image upload → metadata → categorize → submit (4 step)
 *   - Instagram:  file pick → crop → filter → caption           (4 step)
 *
 * のように複数のモーダルページを跨ぐ。各ページで (a) このページの input を埋め
 * (b) "Next" ボタンを押して次のページへ進む、を繰り返し、最終ページで本来の post
 * button を click する。
 *
 * Step Runner はこのフローを Step[] + finalize で表現する。content script は
 * Step 配列を組み立てて runner に渡すだけで良い。
 *
 * P12 実装スコープ:
 *   - executeMultiStepFlow の本体実装 (step ループ + advance + awaitNextDom)
 *   - confirm dialog 自動承認の流用 (post-flow.ts の maybeConfirmDialog を export 化)
 *   - step 失敗時のエラーメッセージは step.name を含める
 *
 * 設計上の決定:
 *   - PlatformAdapter には buildSteps を生やさない。adapter は metadata のみで、
 *     flow の選択は content script が import する関数で表現する (executePostFlow か
 *     executeMultiStepFlow)。multi-step adapter の content script は新規で書く。
 *   - selector / texts / finder の優先順序は executePostFlow と同じ (finder > selector > texts)。
 *   - 単体テストは「dry-run で全 step が走り finalize は click されない」を最低限カバー。
 */
import { findClickableByText, sleep, waitForCondition, waitForElement } from './dom';
import { maybeConfirmDialog } from './post-flow';
import { t } from './i18n';
import {
  markPostStepCompleted,
  markPostStepFailed,
  markPostStepStarted,
  markPostSubmissionStarted,
} from './post-submission-state';

/**
 * wizard の 1 ページ分。`action` で input を埋め、`advance` で次へ進む。
 * 最終ページは `advance` を省略する (代わりに `MultiStepFlowOptions.finalize` を使う)。
 */
export interface Step {
  /** 識別用 (log / error message)。例: "select-images", "fill-caption" */
  name: string;
  /**
   * このページで実行する DOM 操作。テキスト注入 / 画像 drop / select 操作など。
   * MAIN-world 経由が必要なケースは inject-helper を使う側 (image.ts と同じ要領)。
   */
  action: () => Promise<void>;
  /** action 完了後の DOM settle 待機 (default 300ms)。React の state 反映を待つ */
  settleMs?: number;
  /**
   * 次のページへ進むボタン。selector / texts / finder のどれか必須。
   * 最終 step は省略 (省略 = MultiStepFlowOptions.finalize に委譲)。
   */
  advance?: AdvanceSpec;
  /**
   * advance click 後の DOM 確定待機。指定 selector が現れるまで待つ。
   * 省略時は固定 sleep にフォールバック (settleMs を流用)。
   */
  awaitNextDom?: {
    selector: string;
    timeoutMs?: number;
  };
}

export interface AdvanceSpec {
  selector?: string;
  texts?: string[];
  finder?: () => HTMLElement | null;
  /** advance ボタンが clickable になるまでの待機 timeout (default 8000ms) */
  timeoutMs?: number;
}

export interface FinalizeSpec extends AdvanceSpec {
  /** 押下後に出る確認ダイアログ (例: "Discard changes?") を auto-confirm する場合 */
  confirmDialogButtonTexts?: string[];
  /** 確認ダイアログが遅れて出る SNS 向けの初期待機猶予。 */
  confirmDialogGraceMs?: number;
  /** click 後の処理猶予 (default 1500ms) */
  afterClickDelayMs?: number;
}

export interface MultiStepFlowOptions {
  /** 順次実行される step 配列 */
  steps: Step[];
  /**
   * 最終ページで押す本来の post button。dryRun=true なら click をスキップして
   * highlight だけする (executePostFlow と同じ挙動)。
   */
  finalize: FinalizeSpec;
  /** dry-run: 全 step は実行するが finalize.click は行わない */
  dryRun?: boolean;
}

/**
 * Pixiv / DeviantArt / Instagram のような wizard 型 SNS 用 runner。
 *
 * 実行フロー:
 *   for step of steps:
 *     await step.action()
 *     await sleep(step.settleMs ?? 300)
 *     if step.advance:
 *       advance ボタンを clickable まで待って click
 *       step.awaitNextDom があれば selector 出現を待つ
 *   if !dryRun:
 *     finalize ボタンを click + confirm dialog があれば承認
 *     afterClickDelayMs 待機
 *
 * dryRun=true は finalize の click だけスキップ + highlight する
 * (executePostFlow と同じ挙動)。
 */
export async function executeMultiStepFlow(options: MultiStepFlowOptions): Promise<void> {
  const { steps, finalize, dryRun = false } = options;
  if (steps.length === 0) {
    throw new Error('executeMultiStepFlow: steps must not be empty');
  }

  for (const step of steps) {
    markPostStepStarted(step.name);
    try {
      await step.action();
    } catch (err) {
      markPostStepFailed(step.name);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(t('runtimeStepActionFailed', step.name, msg));
    }
    await sleep(step.settleMs ?? 300);
    markPostStepCompleted(step.name);

    if (!step.advance) continue;

    markPostStepStarted(`${step.name}:advance`);
    const advanceBtn = await waitForStepButton(step.advance, step.advance.timeoutMs ?? 8000);
    if (!advanceBtn) {
      markPostStepFailed(`${step.name}:advance`);
      // v0.5.11〜 diagnostics: dialog 内に見えた button text を error message に
      // 含める。 auto-triage が SNS UI 変更で出てくる新 button text を patch
      // しやすくなる (= "Next" を期待してたが実際は "Continue" だった、等)。
      const seen = dumpVisibleDialogButtons();
      const seenHint = seen ? ` [visible buttons: ${seen}]` : '';
      throw new Error(
        t('runtimeStepAdvanceMissing', step.name, seenHint),
      );
    }
    advanceBtn.click();
    markPostStepCompleted(`${step.name}:advance`);

    if (step.awaitNextDom) {
      markPostStepStarted(`${step.name}:await-next`);
      const next = await waitForElement<HTMLElement>(
        step.awaitNextDom.selector,
        step.awaitNextDom.timeoutMs ?? 8000,
      );
      if (!next) {
        markPostStepFailed(`${step.name}:await-next`);
        throw new Error(
          t('runtimeStepNextDomMissing', step.name, step.awaitNextDom.selector),
        );
      }
      markPostStepCompleted(`${step.name}:await-next`);
    } else {
      await sleep(step.settleMs ?? 300);
    }
  }

  markPostStepStarted('wait-submit');
  const finalizeBtn = await waitForStepButton(finalize, finalize.timeoutMs ?? 8000);
  if (!finalizeBtn) {
    markPostStepFailed('wait-submit');
    throw new Error(t('runtimeFinalPostButtonMissing'));
  }
  markPostStepCompleted('wait-submit');

  if (dryRun) {
    console.log('[Tutti] dry-run: finalize button found and enabled, skipping click', finalizeBtn);
    const orig = finalizeBtn.style.outline;
    finalizeBtn.style.outline = '3px dashed #f59e0b';
    setTimeout(() => { finalizeBtn.style.outline = orig; }, 5000);
    return;
  }

  markPostSubmissionStarted();
  finalizeBtn.click();

  if (finalize.confirmDialogButtonTexts && finalize.confirmDialogButtonTexts.length > 0) {
    markPostStepStarted('complete-confirmation');
    await maybeConfirmDialog(finalize.confirmDialogButtonTexts, finalize.confirmDialogGraceMs);
    markPostStepCompleted('complete-confirmation');
  }

  markPostStepStarted('post-processing');
  await sleep(finalize.afterClickDelayMs ?? 250);
  markPostStepCompleted('post-processing');
}

/**
 * v0.5.11: 「次へ進むボタンが見つかりません」 系 error の診断用に、 開いている
 * dialog 内で見える button text を集約して 1 行に。 user の auto-report に
 * 載って、 auto-triage が SNS UI 変更の新 button text を patch しやすくなる。
 */
function dumpVisibleDialogButtons(): string {
  if (typeof document === 'undefined') return '';
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
  if (dialogs.length === 0) return '';
  const texts: string[] = [];
  for (const d of dialogs) {
    for (const b of d.querySelectorAll<HTMLElement>('button, [role="button"]')) {
      const t = (b.textContent ?? '').trim().slice(0, 30);
      if (t && !texts.includes(t)) texts.push(t);
    }
  }
  return texts.join(' | ');
}

/**
 * advance / finalize の button 探索。post-flow.ts の findButton と同じロジック。
 * step 内 action から advance を手動でトリガーしたい場合にも使える。
 */
export function findStepButton(opts: AdvanceSpec): HTMLElement | null {
  if (opts.finder) return opts.finder();
  if (opts.selector) {
    for (const part of opts.selector.split(',').map((s) => s.trim()).filter(Boolean)) {
      const el = document.querySelector<HTMLElement>(part);
      if (el) return el;
    }
  }
  if (opts.texts && opts.texts.length > 0) {
    return findClickableByText(opts.texts);
  }
  return null;
}

/**
 * advance ボタンが現れて clickable になるまで待つ。timeout 内に見つからなければ null。
 * P12 の本体実装で executeMultiStepFlow から呼ぶ想定。
 */
export async function waitForStepButton(
  opts: AdvanceSpec,
  timeoutMs = 8000,
): Promise<HTMLElement | null> {
  return await waitForCondition<HTMLElement>(() => {
    const btn = findStepButton(opts);
    if (
      btn &&
      btn.getAttribute('aria-disabled') !== 'true' &&
      !(btn as HTMLButtonElement).disabled
    ) {
      return btn;
    }
    return null;
  }, { timeoutMs, intervalMs: 150 });
}
