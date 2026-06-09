<script lang="ts">
  import type {
    Message,
    PlatformId,
    PostResultMessage,
  } from '../../src/messages';
  import { getAdapter } from '../../src/adapters/registry';
  import { initLogLevelFromSettings } from '../../src/utils/logger';
  import {
    clearDraft,
    getDraft,
    getLastSeenUsers,
    getSelectedPlatforms,
    getSettings,
    saveDraft,
    saveSelectedPlatforms,
    saveSettings,
    RESPONSIBLE_USE_ACK_VERSION,
    type HistoryEntry,
    type LastSeenUsers,
  } from '../../src/storage';
  import type { FailureHintCta } from '../../src/utils/failure-hint';
  import { t } from '../../src/utils/i18n';
  import {
    DEFAULT_SELECTED_PLATFORMS,
    POPUP_PLATFORMS,
    resolveTuttiContext,
  } from '../../src/popup/platforms';
  import type {
    FailureHistoryEntry,
    ImagePreview,
    PlatformOption,
    ReportResult,
    SnsPreset,
    VideoPreview,
    Visibility,
  } from '../../src/popup/types';
  import { filterRecentPlatforms as filterRecentPostPlatforms } from '../../src/popup/retry-dedup';
  import {
    buildRetryDedupSkippedResults,
    failedRetryPlatforms,
    mergePostResults,
    sendPostRequest,
    shouldClearDraftAfterSubmit,
    uncertainPlatforms,
  } from '../../src/popup/post-submit';
  import {
    loadPopupHistoryThumbs,
    revokeHistoryThumbUrls,
  } from '../../src/popup/history-thumbs';
  import {
    applyPresetSelection,
    createPresetFromSelection,
    removePresetById,
    selectedPlatformIds,
  } from '../../src/popup/presets';
  import {
    applyBackgroundState,
    applyProgressMessage,
    type BgStateResponse,
    type CompressionProgress,
    type PostingViewState,
  } from '../../src/popup/posting-progress';
  import {
    buildImageCompatibility,
    buildVideoCompatibility,
    countTotalPosts,
    resolveCurrentKind,
  } from '../../src/popup/compatibility';
  import {
    filesFromClipboardItems,
    isFileDrag,
    restoreImagePreviews,
    restoreVideoPreview,
    revokeImagePreviews,
    revokeVideoPreview,
    serializeImagesForDraft,
    serializeVideoForDraft,
  } from '../../src/popup/media-preview';
  import {
    addFilesToMediaState,
    moveImageAt,
    removeImageAt,
    removeVideoFromState,
  } from '../../src/popup/media-state';
  import {
    openPopupGitHubIssue,
    submitPopupErrorReport,
    type PopupReportContext,
  } from '../../src/popup/error-report-submit';
  import HeaderBar from './components/HeaderBar.svelte';
  import AutoPostControl from './components/AutoPostControl.svelte';
  import MediaComposer from './components/MediaComposer.svelte';
  import AdvancedOptions from './components/AdvancedOptions.svelte';
  import PresetBar from './components/PresetBar.svelte';
  import PlatformSelector from './components/PlatformSelector.svelte';
  import PostActions from './components/PostActions.svelte';
  import ProgressStatus from './components/ProgressStatus.svelte';
  import DiagnosticsPanel from './components/DiagnosticsPanel.svelte';
  import HistoryStrip from './components/HistoryStrip.svelte';
  import ErrorReportDialog from './components/ErrorReportDialog.svelte';
  import ResponsibleUseDialog from './components/ResponsibleUseDialog.svelte';

  const platforms: PlatformOption[] = POPUP_PLATFORMS;

  let text = $state('');
  // Pixiv / DeviantArt / Instagram は image-only、TikTok / YouTube は video-only で
  // Beta (P12) 挙動未検証のため初期値 false。他 SNS は従来通り true。
  let selected = $state<Record<PlatformId, boolean>>({ ...DEFAULT_SELECTED_PLATFORMS });
  // v0.5.0: 同じ App.svelte を popup.html / sidepanel.html / popup.html?floating=1
  // 3 種類の entry で共用する。 context を URL から検出して width 等 layout を切替。
  const tuttiContext = resolveTuttiContext();

  let images = $state<ImagePreview[]>([]);
  let video = $state<VideoPreview | null>(null);
  let posting = $state(false);
  let pendingPlatforms = $state<PlatformId[]>([]);
  let lastResults = $state<PostResultMessage[] | null>(null);
  let errorMessage = $state<string | null>(null);
  // v0.5.9〜 履歴は popup 下部に常時表示 (compact strip)。 詳細・検索・編集は History tab 側で。
  let history = $state<HistoryEntry[]>([]);
  let historyThumbs = $state<Record<string, string[]>>({});
  let historyThumbUrls: string[] = [];
  let draftLoaded = $state(false);
  let lastSeenUsers = $state<LastSeenUsers>({});
  /** v0.4.86: 失敗 hint card を expand してる platform (null = 全て collapse) */
  let expandedFailure = $state<PlatformId | null>(null);
  /** v0.4.87: 画像 alt text (a11y / Bluesky・Mastodon API path で送信) */
  let imageAlts = $state<string[]>([]);
  /** v0.4.87: content warning / spoiler (Mastodon / Misskey API path 用) */
  let cw = $state('');
  /** v0.4.87: visibility (Mastodon / Misskey API path 用)。 default 'public' */
  let visibility = $state<Visibility>('public');
  /** v0.4.87: 詳細セクションの展開状態 */
  let showAdvanced = $state(false);
  /**
   * v0.4.90: 動画 trim opt-in (秒数)。 null = trim 無し (default、 CONCEPT 通り「拒否」)。
   * 数値が入れば user が明示的に「切り詰めて投稿」 した状態。 ffmpeg で `-t N` で切る。
   */
  let trimToS = $state<number | null>(null);
  /** v0.4.91: SNS 組み合わせプリセット (Settings から読み込み) */
  let snsPresets = $state<SnsPreset[]>([]);
  // 自動投稿(autoPost): false=dry run(ボタンを押すだけで Compose 確認、実投稿はしない)
  // true=実投稿。デフォルトは false にして、初回ユーザーの誤投稿を防ぐ。
  let autoPost = $state(false);
  let autoPostLoaded = $state(false);
  let responsibleUseDialogOpen = $state(false);
  let responsibleUseAccepted = $state(false);
  const version = browser.runtime.getManifest().version;
  $effect(() => {
    void getSettings().then((s) => {
      autoPost = s.autoPost;
      autoPostLoaded = true;
      snsPresets = s.snsPresets ?? [];
      responsibleUseAccepted = (s.responsibleUseAcceptedVersion ?? 0) >= RESPONSIBLE_USE_ACK_VERSION;
      responsibleUseDialogOpen = !responsibleUseAccepted;
    });
    void initLogLevelFromSettings();
  });

  // 障害報告 dialog の状態。エラーが新規に出たら proactive に表示する。
  let errorDialogOpen = $state(false);
  let errorDialogText = $state('');
  // 同じエラーで複数回開かないように key で de-dupe
  let dialogShownForKey = $state<string | null>(null);
  $effect(() => {
    let key: string | null = null;
    let text = '';
    if (errorMessage) {
      key = `error:${errorMessage}`;
      text = errorMessage;
    } else {
      const failures = lastResults?.filter((r) => !r.success) ?? [];
      if (failures.length > 0) {
        key = `failures:${failures.map((f) => `${f.platform}:${f.uncertain ? 'uncertain' : 'failed'}:${f.error ?? ''}`).join('|')}`;
        text = failures.map((f) => `${f.platform}${f.uncertain ? ' (uncertain)' : ''}: ${f.error ?? '(no detail)'}`).join('\n');
      }
    }
    if (key && key !== dialogShownForKey) {
      errorDialogOpen = true;
      errorDialogText = text;
      dialogShownForKey = key;
    }
  });

  // CF Workers proxy が GitHub Issues に転送する。1-click で報告可能。
  // proxy が落ちてた / network エラーの場合は GitHub URL fallback を提示。
  const REPORT_ENDPOINT = 'https://tutti-report.komm64.workers.dev';

  function buildReportContext(): PopupReportContext {
    return {
      version,
      text,
      platforms,
      selected,
      images,
      video,
      imageAlts,
      cw,
      visibility,
      trimToS,
    };
  }

  // 1-click 報告 (proxy 経由)
  let reportSubmitting = $state(false);
  let reportResult = $state<ReportResult | null>(null);
  async function handleReportError(errorText: string): Promise<void> {
    reportSubmitting = true;
    reportResult = null;
    try {
      reportResult = await submitPopupErrorReport({
        errorText,
        context: buildReportContext(),
        endpoint: REPORT_ENDPOINT,
        dedupedMessage: (hours) => t('reportDeduped', String(hours)),
      });
    } catch (e) {
      reportResult = { ok: false, error: e instanceof Error ? e.message : String(e) };
    } finally {
      reportSubmitting = false;
    }
  }

  /**
   * fallback: 報告 proxy が落ちてる時に user が手動送信する経路。
   * v0.4.93〜: mailto: (default mail client 無いと開かない、 URL length 制限あり) を
   * やめて GitHub Issues の new URL に直接遷移する。 tutti-issues は public repo
   * なので user が自分で file 可能。 body は URL に乗せられない長さなので clipboard
   * にも入れる、 GitHub new issue form の body field に user が paste する形。
   */
  async function openGitHubIssueDirect(errorText: string): Promise<void> {
    await openPopupGitHubIssue({
      errorText,
      context: buildReportContext(),
      note: t('reportEmailNote'),
      overflowNote: t('reportClipboardOverflow'),
    });
  }
  // 永続選択を読み込んだあとに autoPost トグルが変わったら保存
  $effect(() => {
    autoPost;
    if (!autoPostLoaded) return;
    void saveSettings({ autoPost });
  });
  // v0.5.2: t() は ./src/utils/i18n からの named import (top of script)

  // ログイン中アカウントを popup 起動時に読み込む。
  // v0.4.83: stale 値 (multi-account 切替後など) を防ぐため、 background に
  // BROADCAST_REFRESH_USERS を投げて各 SNS tab で active user を再検出させる。
  // 結果は CURRENT_USER → storage 経由で来るので、 短い delay 後に再読込。
  $effect(() => {
    void getLastSeenUsers().then((u) => (lastSeenUsers = u));
    void browser.runtime.sendMessage({ type: 'BROADCAST_REFRESH_USERS' }).catch(() => { /* ignore */ });
    // 800ms 後に再読込 (content script 側の detection と CURRENT_USER 伝播の余裕)
    setTimeout(() => {
      void getLastSeenUsers().then((u) => (lastSeenUsers = u));
    }, 800);
  });

  // SNS 選択は **永続**(投稿で消えない)、draft は ephemeral(text + media)。
  let selectedLoaded = $state(false);
  $effect(() => {
    if (selectedLoaded) return;
    void getSelectedPlatforms().then((s) => {
      if (s) {
        for (const [k, v] of Object.entries(s)) {
          if (typeof v === 'boolean' && k in selected) {
            selected[k as PlatformId] = v;
          }
        }
      }
      selectedLoaded = true;
    });
  });

  // 下書き(text + media)を読み込む(マウント時に 1 回)
  $effect(() => {
    if (draftLoaded) return;
    void getDraft().then((draft) => {
      if (draft) {
        text = draft.text;
        images = restoreImagePreviews(draft.images);
        video = restoreVideoPreview(draft.video);
      }
      draftLoaded = true;
    });
  });

  // 下書き(text/メディア)の自動保存(300ms デバウンス)
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    text;
    images.length; video;
    if (!draftLoaded) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void saveDraft({
        text,
        images: serializeImagesForDraft(images),
        video: serializeVideoForDraft(video),
      });
    }, 300);
  });

  // SNS 選択の永続保存(変わったら即保存)
  // v0.4.100: 新 SNS (pixiv / deviantart / instagram / tiktok / youtube) が
  // $effect の dependency に入っておらず、 これらを toggle しても save が走らず
  // 「checkbox が毎回外れる」 bug の原因だった。 全 11 platform を tracker に追加。
  let selectedSaveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    selected.x; selected.bluesky; selected.threads;
    selected.mastodon; selected.misskey; selected.tumblr;
    selected.pixiv; selected.deviantart; selected.instagram;
    selected.tiktok; selected.youtube;
    if (!selectedLoaded) return;
    if (selectedSaveTimer) clearTimeout(selectedSaveTimer);
    selectedSaveTimer = setTimeout(() => {
      void saveSelectedPlatforms({ ...selected });
    }, 200);
  });

  // Diagnostics: SNS が動かない時の障害切り分け用 dump を生成
  let diagnosticsText = $state<string | null>(null);
  let diagnosticsRunning = $state(false);
  let diagnosticsCopied = $state(false);
  async function runDiagnostics() {
    diagnosticsRunning = true;
    diagnosticsText = null;
    try {
      const res = (await browser.runtime.sendMessage({ type: 'DIAGNOSE_REQUEST' })) as
        | { report?: unknown; error?: string }
        | undefined;
      if (res?.error) diagnosticsText = `error: ${res.error}`;
      else diagnosticsText = JSON.stringify(res?.report ?? null, null, 2);
    } catch (e) {
      diagnosticsText = `error: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      diagnosticsRunning = false;
    }
  }
  async function copyDiagnostics() {
    if (!diagnosticsText) return;
    try {
      await navigator.clipboard.writeText(diagnosticsText);
      diagnosticsCopied = true;
      setTimeout(() => { diagnosticsCopied = false; }, 1500);
    } catch { /* ignore */ }
  }

  async function loadHistory() {
    revokeHistoryThumbUrls(historyThumbUrls);
    const { entries, thumbs, objectUrls } = await loadPopupHistoryThumbs();
    history = entries;
    historyThumbs = thumbs;
    historyThumbUrls = objectUrls;
  }

  // v0.5.9: 履歴は常時表示なので popup mount 時に load + storage 変更で auto refresh
  $effect(() => {
    void loadHistory();
    const listener = (changes: Record<string, unknown>, area: string): void => {
      if (area === 'local' && 'postHistory' in changes) void loadHistory();
    };
    chrome.storage.onChanged.addListener(listener as Parameters<typeof chrome.storage.onChanged.addListener>[0]);
    return () => chrome.storage.onChanged.removeListener(listener as Parameters<typeof chrome.storage.onChanged.removeListener>[0]);
  });

  // P16: 動画圧縮の進捗 (offscreen から broadcast)
  let compressionProgress = $state<CompressionProgress | null>(null);
  // ETA 計算: 圧縮開始 timestamp と最後に観測した progress から残り時間を推定
  let compressionStartedAt = $state<number | null>(null);
  let compressionEtaS = $state<number | null>(null);

  function currentPostingViewState(): PostingViewState {
    return {
      posting,
      pendingPlatforms,
      lastResults,
      compressionProgress,
      compressionStartedAt,
      compressionEtaS,
    };
  }

  function applyPostingViewState(next: PostingViewState): void {
    posting = next.posting;
    pendingPlatforms = next.pendingPlatforms;
    lastResults = next.lastResults;
    compressionProgress = next.compressionProgress;
    compressionStartedAt = next.compressionStartedAt;
    compressionEtaS = next.compressionEtaS;
  }

  // P19 / v0.4.63: popup 閉じ→再 open 時、background が保持してる進行状態を
  // 復元する。pending / 完了済 results / 圧縮進捗 を全部復元することで、
  // 「2/7 完了済み、5 投稿中」のような中間状態でも閉じ→開きで正しく表示される。
  // 旧コードは posting boolean だけ復元していたので、再 open すると pending /
  // results が空 → 全 SNS が isQueued (「Queue...」) と誤表示されていた。
  $effect(() => {
    void browser.runtime.sendMessage({ type: 'GET_BG_STATE' }).then((res: unknown) => {
      const r = res as BgStateResponse | undefined;
      applyPostingViewState(applyBackgroundState(r, currentPostingViewState()));
    }).catch(() => { /* background sleep してたら null 戻り、無視 */ });
  });

  // background からの進捗ストリームを受信
  $effect(() => {
    const listener = (rawMsg: unknown) => {
      const msg = rawMsg as Message;
      const next = applyProgressMessage(msg, currentPostingViewState());
      if (next) applyPostingViewState(next);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  });

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canPost) {
      e.preventDefault();
      void handlePost();
    }
  }

  // v0.5.9: 履歴は常時表示。 「History」 link は full History tab を開く
  function openHistoryTab(): void {
    void browser.tabs.create({ url: browser.runtime.getURL('history.html') });
  }

  /**
   * v0.4.84: unsigned 行の ↗ link click で SNS の login/home page を新 tab で開く。
   * tab を開けば content script が起動 → detectUser() が走って Tutti に
   * CURRENT_USER が来る (= 「unknown」 が解消)。 user が tab で login してから
   * Tutti popup を開き直せば 検出値が見える。
   */
  function openLoginUrl(id: PlatformId): void {
    const adapter = getAdapter(id);
    const url = adapter?.getLoginUrl?.();
    if (!url) return;
    void browser.tabs.create({ url, active: true });
    // popup は click とともに close されるが、 明示的に閉じてもよい。
    // chrome.tabs.create を triggered した瞬間に popup が消えるのが自然な挙動。
  }

  /**
   * v0.4.86: failure hint card の CTA を実行する。
   * 「retry」 = この SNS だけ再送 / 「open-sns」 = SNS の login/home を新 tab で /
   * 「report」 = 障害報告 / 「wait」 = card を閉じる (user に時間取ってもらう)。
   */
  /**
   * v0.4.88: 履歴 entry から失敗 SNS を再送する。
   * 履歴 entry は本文 preview だけ持ってる (媒体 / tag は持たない) ので、
   * textarea に本文を流し込んで失敗した SNS を選択 → user に確認して投稿。
   * 媒体は user 側で再添付が必要。
   */
  async function retryFromHistory(entry: FailureHistoryEntry): Promise<void> {
    const failedIds = (Object.entries(entry.results) as [PlatformId, { success: boolean; uncertain?: boolean }][])
      .filter(([, r]) => !r.success && !r.uncertain)
      .map(([id]) => id);
    if (failedIds.length === 0) return;
    // v0.5.9〜 v1 entry は text (full) を持つ。 v0 legacy は textPreview (80 char) のみ
    text = entry.text ?? entry.textPreview;
    // 失敗 SNS をチェック状態に
    for (const id of failedIds) {
      selected[id] = true;
    }
    // user が media を再添付 or 本文を編集してから手動で post boutton 押す前提。
    // 自動 submit はしない (履歴から prefill するだけ)。
    // v0.5.9〜 履歴は常時表示なので 「panel を閉じる」 処理は不要
  }

  async function handleFailureCta(p: PlatformId, cta: FailureHintCta): Promise<void> {
    if (cta.kind === 'open-sns') {
      void browser.tabs.create({ url: cta.url, active: true });
    } else if (cta.kind === 'retry') {
      expandedFailure = null;
      const safeIds = await filterAlreadyLandedPlatforms([p]);
      if (safeIds.length > 0) {
        await submitPostFor(safeIds, /* isRetry */ true);
      } else {
        errorMessage = t('retryDedupSkippedHint');
      }
    } else if (cta.kind === 'report') {
      const result = lastResults?.find((r) => r.platform === p);
      const errorText = result?.error ?? t('platformFailedShort', p);
      expandedFailure = null;
      await handleReportError(errorText);
    } else if (cta.kind === 'wait') {
      // 何もしないが card を閉じて 「user に待ってもらってる」 状態を視覚化
      expandedFailure = null;
    }
  }

  const selectedIds = $derived(
    selectedPlatformIds(selected).filter((id) => platforms.some((p) => p.id === id && p.available)),
  );
  // ログイン済み(lastSeenUsers でハンドル検出済み)を上 section、未確認を下 section に。
  // 各 section 内では platforms 配列の固定順を維持する。
  const signedInPlatforms = $derived(
    platforms.filter((p) => !!lastSeenUsers[p.id]),
  );
  const unsignedPlatforms = $derived(
    platforms.filter((p) => !lastSeenUsers[p.id]),
  );
  const hasMedia = $derived(images.length > 0 || video !== null);
  // 現在のコンテンツ種別を自動判定: 動画 60s 以下=short / 超=long / 画像 / 文字
  const currentKind = $derived.by(() => resolveCurrentKind(images, video));
  const canPost = $derived(
    !posting && (text.trim().length > 0 || hasMedia) && selectedIds.length > 0,
  );
  const totalPostCount = $derived(countTotalPosts(platforms, selectedIds, text));
  const videoCompatibility = $derived(buildVideoCompatibility(platforms, video));
  // 画像サイズは投稿時に自動リサイズされるので、枚数オーバーだけ警告する
  const imageCompatibility = $derived(
    buildImageCompatibility(platforms, images, video, (max) => t('constraintTooManyImages', String(max))),
  );

  async function processFiles(files: File[]) {
    const next = await addFilesToMediaState({ images, video, imageAlts }, files);
    images = next.images;
    video = next.video;
    imageAlts = next.imageAlts;
  }

  async function handleMedia(e: Event) {
    const input = e.target as HTMLInputElement;
    await processFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  // ── ドラッグ&ドロップ ──────────────────────────────────────────
  // dragenter/leave は子要素に入るたび発火するので、深さカウンタで管理
  let dragDepth = $state(0);
  const isDragging = $derived(dragDepth > 0);

  function handleDragEnter(e: DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth++;
  }

  function handleDragOver(e: DragEvent) {
    // ファイルドラッグのみ preventDefault(テキスト drag は textarea に任せる)
    if (isFileDrag(e)) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    }
  }

  function handleDragLeave(e: DragEvent) {
    if (!isFileDrag(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
  }

  async function handleDrop(e: DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth = 0;
    const files = Array.from(e.dataTransfer?.files ?? []);
    await processFiles(files);
  }

  // ── クリップボード paste (画像 / 動画) ─────────────────────────
  // textarea で Ctrl+V → clipboardData に File が居れば media として attach。
  // テキスト + media が同時に居る場合は両方処理する (text は textarea に流す)。
  async function handlePaste(e: ClipboardEvent) {
    const files = filesFromClipboardItems(e.clipboardData?.items);
    if (files.length === 0) return; // text-only paste は textarea にそのまま流す
    e.preventDefault();
    await processFiles(files);
  }

  function removeImage(i: number) {
    const next = removeImageAt({ images, video, imageAlts }, i);
    images = next.images;
    imageAlts = next.imageAlts;
  }

  /**
   * v0.4.89: 画像の並び替え。 delta = -1 で 1 つ上、 +1 で 1 つ下と swap。
   * boundary check は呼出 側の disabled で防ぐが念のため。
   */
  /**
   * v0.4.91: preset を適用。 selected を preset の platforms 通りに上書き、
   * 永続化も走らせる (saveSelectedPlatforms 経由)。
   */
  function applyPreset(preset: SnsPreset): void {
    selected = applyPresetSelection(selected, preset);
    void saveSelectedPlatforms(selected);
  }

  /**
   * v0.4.91: 現在 selected を新 preset として保存。 名前は prompt で user 入力。
   */
  async function savePreset(): Promise<void> {
    const name = prompt(t('presetSavePrompt'));
    if (name === null) return;
    const preset = createPresetFromSelection(selected, name);
    if (!preset) return;
    snsPresets = [...snsPresets, preset];
    await saveSettings({ snsPresets });
  }

  /** v0.4.91: preset を削除 */
  async function removePreset(id: string): Promise<void> {
    if (!confirm(t('presetRemoveConfirm'))) return;
    snsPresets = removePresetById(snsPresets, id);
    await saveSettings({ snsPresets });
  }

  function moveImage(i: number, delta: -1 | 1): void {
    const next = moveImageAt({ images, video, imageAlts }, i, delta);
    images = next.images;
    imageAlts = next.imageAlts;
  }

  function removeVideo() {
    const next = removeVideoFromState({ images, video, imageAlts });
    video = next.video;
  }

  function setSelectedPlatform(id: PlatformId, checked: boolean): void {
    selected[id] = checked;
  }

  function setImageAlt(index: number, value: string): void {
    const next = imageAlts.slice();
    next[index] = value;
    imageAlts = next;
  }

  function openFailureReportDialog(text: string): void {
    errorDialogText = text;
    errorDialogOpen = true;
    reportResult = null;
  }

  function closeReportDialog(reset = false): void {
    errorDialogOpen = false;
    if (reset) reportResult = null;
  }

  async function acceptResponsibleUse(): Promise<void> {
    await saveSettings({
      responsibleUseAcceptedVersion: RESPONSIBLE_USE_ACK_VERSION,
      responsibleUseAcceptedAt: Date.now(),
    });
    responsibleUseAccepted = true;
    responsibleUseDialogOpen = false;
  }

  async function handlePost() {
    if (!canPost) return;
    const uncertainSelected = new Set(uncertainPlatforms(lastResults));
    if (selectedIds.some((id) => uncertainSelected.has(id))) {
      // 成否未確定の SNS を本文を残したまま通常投稿すると重複し得る。
      // 外部 SNS を確認するまで同一 popup session からの再送を止める。
      errorMessage = t('runtimePostUncertain');
      return;
    }
    const safeIds = await filterRecentlyUncertainPlatforms(selectedIds);
    if (safeIds.length !== selectedIds.length) {
      // extension 再起動後も履歴に uncertain が残る。同一本文を通常投稿として
      // 送り直す経路も止め、SNS 側で landing を確認してもらう。
      errorMessage = t('runtimePostUncertain');
      return;
    }
    await submitPostFor(selectedIds, /* isRetry */ false);
  }

  /**
   * v0.4.58: 失敗 SNS の手動再送。
   * 直前の text / images / video が popup state に残っている前提 (= 全成功でない
   * 場合は handlePost が clear しないので残る)。失敗した platform だけを対象に
   * もう一度 background へ送る。
   *
   * v0.5.7: bodyHash で直近 10 分以内の同一 post に既に成功 entry が居る platform は
   * 「retry してもどうせ重複投稿になる」 ので skip。 user 報告 (Threads が false-fail
   * 後の retry で実重複投稿になる) の対処。
   */
  async function handleRetryFailed() {
    if (!lastResults || posting) return;
    const failedIds = failedRetryPlatforms(lastResults);
    if (failedIds.length === 0) return;

    // 同一 bodyHash で直近 10 分以内に成功してる platform を retry 対象から外す
    const dedupedFailedIds = await filterAlreadyLandedPlatforms(failedIds);
    if (dedupedFailedIds.length === 0) {
      // 全部 「実は landed 済」 → retry を実行しない、 既存の失敗表示を成功扱いに置き換え
      const alreadyLanded = buildRetryDedupSkippedResults(failedIds, t('retryDedupSkippedHint'));
      lastResults = [
        ...lastResults.filter((r) => r.success),
        ...alreadyLanded,
      ];
      errorMessage = null;
      return;
    }

    // 既存の失敗 entry だけ消す。成功 entry は維持して result panel に表示し続ける
    lastResults = lastResults.filter((r) => r.success);
    await submitPostFor(dedupedFailedIds, /* isRetry */ true);
  }

  /**
   * 直近 10 分以内に同一 bodyHash + 同一 platform で成功している entry がある platform を
   * 候補から除外。 戻り値: 真の retry が必要な platform 列。
   */
  async function filterAlreadyLandedPlatforms(candidates: PlatformId[]): Promise<PlatformId[]> {
    return filterRecentPostPlatforms(candidates, {
      text,
      images,
      video,
      matches: (r) => r.success === true,
    });
  }

  async function filterRecentlyUncertainPlatforms(candidates: PlatformId[]): Promise<PlatformId[]> {
    return filterRecentPostPlatforms(candidates, {
      text,
      images,
      video,
      matches: (r) => r.uncertain === true,
    });
  }

  async function submitPostFor(platforms: PlatformId[], isRetry: boolean) {
    if (platforms.length === 0) return;
    const requestAutoPost = autoPost;
    posting = true;
    if (!isRetry) {
      lastResults = [];
    }
    pendingPlatforms = [...platforms];
    errorMessage = null;

    try {
      const response = await sendPostRequest({
        text,
        platforms,
        images,
        video,
        imageAlts,
        autoPost: requestAutoPost,
        cw,
        visibility,
        trimToS,
      });
      if (!response) {
        errorMessage = t('backgroundNoResponse');
      } else if (response.error) {
        errorMessage = response.error;
      } else if (response.results) {
        // retry の場合は既存の成功 entries を残してマージ。新規 (= 失敗だった
        // platform の新結果) を上書き、別の platform は既存 entry を維持。
        lastResults = mergePostResults(lastResults, response.results, isRetry);
        pendingPlatforms = []; // 進捗ストリームの取りこぼし保険
        // 全成功(retry 後を含む)で下書きをクリア。retry 後の lastResults に
        // failure が 1 件でも残ってたら text / media は維持する (= 再々送可能)
        // preview は SNS compose への投入成功であり実投稿ではないため、draft は残す。
        if (shouldClearDraftAfterSubmit(requestAutoPost, lastResults)) {
          text = '';
          revokeImagePreviews(images);
          images = [];
          revokeVideoPreview(video);
          video = null;
          void clearDraft();
        }
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      posting = false;
      pendingPlatforms = [];
      void loadHistory(); // v0.5.9〜 常時表示なので必ず refresh
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<main
  class="{tuttiContext === 'popup' ? 'w-96' : 'w-full min-w-96 max-w-2xl mx-auto'} p-4 bg-white text-gray-900 relative"
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  {#if isDragging}
    <div class="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div class="absolute inset-2 rounded-lg border-2 border-dashed border-blue-400 bg-blue-50/95"></div>
      <div class="relative text-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 mx-auto text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p class="text-sm font-medium text-blue-700 mt-2">{t('dropMedia')}</p>
      </div>
    </div>
  {/if}

  <HeaderBar
    {version}
    {diagnosticsRunning}
    onOpenHistory={openHistoryTab}
    onRunDiagnostics={runDiagnostics}
  />

  <AutoPostControl
    {autoPost}
    onChange={(value) => (autoPost = value)}
  />

  <MediaComposer
    {text}
    {posting}
    {images}
    {imageAlts}
    {video}
    {trimToS}
    {platforms}
    {selected}
    onTextChange={(value) => (text = value)}
    onPaste={handlePaste}
    onMedia={handleMedia}
    onAltChange={setImageAlt}
    onRemoveImage={removeImage}
    onMoveImage={moveImage}
    onRemoveVideo={removeVideo}
    onTrimChange={(value) => (trimToS = value)}
  />

  <AdvancedOptions
    {showAdvanced}
    {cw}
    {visibility}
    {posting}
    onToggle={() => (showAdvanced = !showAdvanced)}
    onCwChange={(value) => (cw = value)}
    onVisibilityChange={(value) => (visibility = value)}
  />

  <PresetBar
    presets={snsPresets}
    {selected}
    {posting}
    onApply={applyPreset}
    onSave={savePreset}
    onRemove={removePreset}
  />

  <PlatformSelector
    {signedInPlatforms}
    {unsignedPlatforms}
    {selected}
    {selectedIds}
    {text}
    {posting}
    {autoPost}
    {currentKind}
    {lastSeenUsers}
    {pendingPlatforms}
    {lastResults}
    {videoCompatibility}
    {imageCompatibility}
    {expandedFailure}
    onSelectedChange={setSelectedPlatform}
    onOpenLogin={openLoginUrl}
    onToggleFailure={(id) => (expandedFailure = id)}
    onFailureCta={handleFailureCta}
  />

  <PostActions
    {posting}
    {autoPost}
    {canPost}
    selectedCount={selectedIds.length}
    {totalPostCount}
    {errorMessage}
    {lastResults}
    {text}
    {images}
    {video}
    onPost={handlePost}
    onRetryFailed={handleRetryFailed}
    onReportError={handleReportError}
    onOpenFailureReportDialog={openFailureReportDialog}
  />

  <ProgressStatus
    {posting}
    {compressionProgress}
    {compressionEtaS}
    doneCount={lastResults?.length ?? 0}
    totalSelected={selectedIds.length}
  />

  <DiagnosticsPanel
    running={diagnosticsRunning}
    text={diagnosticsText}
    copied={diagnosticsCopied}
    onCopy={copyDiagnostics}
    onClose={() => { diagnosticsText = null; }}
  />

  <HistoryStrip
    {history}
    {historyThumbs}
    onOpenHistory={openHistoryTab}
    onRetry={retryFromHistory}
  />

  {#if errorDialogOpen}
    <ErrorReportDialog
      errorText={errorDialogText}
      {reportSubmitting}
      {reportResult}
      onDismiss={() => closeReportDialog(false)}
      onResetAndDismiss={() => closeReportDialog(true)}
      onReport={() => handleReportError(errorDialogText)}
      onOpenGitHub={async () => {
        await openGitHubIssueDirect(errorDialogText);
        closeReportDialog(true);
      }}
    />
  {/if}

  {#if responsibleUseDialogOpen}
    <ResponsibleUseDialog
      mode={responsibleUseAccepted ? 'review' : 'required'}
      onAccept={acceptResponsibleUse}
      onDismiss={responsibleUseAccepted ? () => { responsibleUseDialogOpen = false; } : undefined}
    />
  {/if}
</main>
