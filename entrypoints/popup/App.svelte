<script lang="ts">
  import type {
    ImageAttachment,
    LogEntry,
    Message,
    PlatformId,
    PlatformProgressMessage,
    PostRequestMessage,
    PostResultMessage,
  } from '../../src/messages';
  import {
    checkVideoConstraint,
    getAdapter,
  } from '../../src/adapters/registry';
  import { resizeImage } from '../../src/utils/image-resize';
  import { packAttachmentForTransfer } from '../../src/utils/attachment';
  import { initLogLevelFromSettings } from '../../src/utils/logger';
  import {
    arrayBufferToBase64,
    base64ByteLength,
    base64ToUint8Array,
  } from '../../src/utils/base64';
  import {
    clearDraft,
    clearPostHistory,
    getDraft,
    getLastSeenUsers,
    getPostHistory,
    getSelectedPlatforms,
    getSettings,
    saveDraft,
    saveSelectedPlatforms,
    saveSettings,
    type HistoryEntry,
    type LastSeenUsers,
  } from '../../src/storage';
  import { splitText } from '../../src/utils/split';

  type PlatformOption = {
    id: PlatformId;
    name: string;
    limit: number;
    available: boolean;
  };

  type ImagePreview = ImageAttachment & { previewUrl: string };
  type VideoPreview = ImageAttachment & { previewUrl: string; durationS: number };

  const MAX_IMAGES = 4;

  /**
   * 表示順は X → Bluesky → Threads → Tumblr → Mastodon → Misskey → Pixiv → DeviantArt の固定。
   * Bluesky は MAU 順なら 4 位だが、Tutti として推したい SNS なので X の隣 (2 位) に置く。
   * その他は概ね MAU 順。Pixiv / DeviantArt は image-only クリエイター向けなので末尾。
   * 並び替えは lastSeenUsers 有無で section 分けするのみ。
   */
  const platforms: PlatformOption[] = [
    { id: 'x', name: 'X', limit: 280, available: true },
    { id: 'bluesky', name: 'Bluesky', limit: 300, available: true },
    { id: 'threads', name: 'Threads', limit: 500, available: true },
    { id: 'tumblr', name: 'Tumblr', limit: 4096, available: true },
    { id: 'mastodon', name: 'Mastodon', limit: 500, available: true },
    { id: 'misskey', name: 'Misskey', limit: 3000, available: true },
    { id: 'pixiv', name: 'Pixiv', limit: 1000, available: true },
    { id: 'deviantart', name: 'DeviantArt', limit: 5000, available: true },
    { id: 'instagram', name: 'Instagram', limit: 2200, available: true },
    { id: 'tiktok', name: 'TikTok', limit: 2200, available: true },
    { id: 'youtube', name: 'YouTube', limit: 5000, available: true },
  ];

  let text = $state('');
  // Pixiv / DeviantArt / Instagram は image-only、TikTok / YouTube は video-only で
  // Beta (P12) 挙動未検証のため初期値 false。他 SNS は従来通り true。
  let selected = $state<Record<PlatformId, boolean>>({
    x: true,
    bluesky: true,
    threads: true,
    mastodon: true,
    misskey: true,
    tumblr: true,
    pixiv: false,
    deviantart: false,
    instagram: false,
    tiktok: false,
    youtube: false,
  });
  let images = $state<ImagePreview[]>([]);
  let video = $state<VideoPreview | null>(null);
  let posting = $state(false);
  let pendingPlatforms = $state<PlatformId[]>([]);
  let lastResults = $state<PostResultMessage[] | null>(null);
  let errorMessage = $state<string | null>(null);
  let showHistory = $state(false);
  let history = $state<HistoryEntry[]>([]);
  let draftLoaded = $state(false);
  let lastSeenUsers = $state<LastSeenUsers>({});
  // 自動投稿(autoPost): false=dry run(ボタンを押すだけで Compose 確認、実投稿はしない)
  // true=実投稿。デフォルトは false にして、初回ユーザーの誤投稿を防ぐ。
  let autoPost = $state(false);
  let autoPostLoaded = $state(false);
  const version = browser.runtime.getManifest().version;
  $effect(() => {
    void getSettings().then((s) => {
      autoPost = s.autoPost;
      autoPostLoaded = true;
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
        key = `failures:${failures.map((f) => `${f.platform}:${f.error ?? ''}`).join('|')}`;
        text = failures.map((f) => `${f.platform}: ${f.error ?? '(no detail)'}`).join('\n');
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

  /**
   * 報告 body に紛れ込み得る PII を redact する多重防御。公開 GitHub Issue に
   * 貼られる前提で過剰に保守的に潰す:
   * - `@user.name`, `@user@instance.tld` 等 → `@<redacted>`
   * - メールアドレス → `<email-redacted>`
   * - URL の path / query / fragment → host のみ残す (v0.4.32 で
   *   `youtube.com/watch?v=xxx` がそのまま漏れる事故があったので追加)
   */
  function redactPII(text: string): string {
    return text
      .replace(/@[\w.-]+(?:@[\w.-]+)?/g, '@<redacted>')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email-redacted>')
      // URL: scheme://host/... → scheme://host/<…>
      // 末尾の `/` 直前まで残し、それ以降の path / query / fragment を潰す
      .replace(/(https?:\/\/[\w.-]+)(\/[^\s"'`<>]*)?/gi, (_m, base) => `${base}/<…>`);
  }

  async function buildReportPayload(errorText: string): Promise<{ title: string; body: string }> {
    let logsExcerpt = '';
    try {
      const res = (await browser.runtime.sendMessage({ type: 'LOG_EXPORT_REQUEST' })) as
        | { entries?: LogEntry[] }
        | undefined;
      const entries = (res?.entries ?? []).slice(-30);
      logsExcerpt = entries
        .map((e) => `[${new Date(e.ts).toISOString()}] ${e.level} (${e.context}) ${e.message}`)
        .join('\n');
    } catch { /* ignore */ }
    // 診断 dump: selector audit + DOM snapshot (P13: AI が selector 修正を提案する材料)
    let diagnoseExcerpt = '';
    try {
      const res = (await browser.runtime.sendMessage({ type: 'DIAGNOSE_REQUEST' })) as
        | { report?: unknown }
        | undefined;
      if (res?.report) {
        // 全体を pretty JSON にして body 末尾に貼る。auto-triage 用 marker で囲む
        diagnoseExcerpt = JSON.stringify(res.report, null, 2);
      }
    } catch { /* ignore */ }
    const ua = navigator.userAgent;
    const title = redactPII(errorText.split('\n')[0]?.slice(0, 80) || 'Tutti エラー報告');
    const sections = [
      '## エラー',
      '```',
      redactPII(errorText.slice(0, 800)),
      '```',
      '',
      '## 環境',
      `- Tutti version: ${version}`,
      `- User agent: ${ua}`,
      '',
      '## 直近のログ(最終 30 件)',
      '```',
      redactPII(logsExcerpt.slice(0, 6000)) || '(no logs captured)',
      '```',
    ];
    if (diagnoseExcerpt) {
      // worker 側 body cap が 50KB なので、diagnostics は 30KB を上限に切る
      const capped = diagnoseExcerpt.slice(0, 30_000);
      sections.push(
        '',
        '## Diagnostics (auto-triage 用、selector audit + redacted DOM snapshot)',
        '<!-- tutti-diagnostics-begin -->',
        '```json',
        redactPII(capped),
        '```',
        '<!-- tutti-diagnostics-end -->',
      );
    }
    return { title, body: sections.join('\n') };
  }

  // ── 報告 dedup (client-side) ────────────────────────────────────────
  // 同じエラー文を 24h 以内に何度も送ろうとする「borked browser state で
  // retry-loop に陥ってるユーザー」 のケースを潰す。一人で issue tracker を
  // 偏らせないため (一人 = 1 報告 / 24h / エラー種別)。
  // 制限を回避できないように厳密な hash ではなく「お行儀のいい dedup」程度で OK。
  const REPORT_DEDUP_KEY = 'reportDedup';
  const REPORT_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

  async function hashReportKey(errorText: string): Promise<string> {
    // 先頭 200 char (=同種エラーは大抵この範囲で一致)。SubtleCrypto で SHA-256 短縮。
    const head = errorText.slice(0, 200);
    const buf = new TextEncoder().encode(head);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).slice(0, 8)
      .map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function isRecentlyReported(hash: string): Promise<number | null> {
    const stored = await browser.storage.local.get(REPORT_DEDUP_KEY);
    const map = (stored[REPORT_DEDUP_KEY] as Record<string, number> | undefined) ?? {};
    const ts = map[hash];
    if (typeof ts !== 'number') return null;
    if (Date.now() - ts > REPORT_DEDUP_WINDOW_MS) return null;
    return ts;
  }

  async function markReported(hash: string): Promise<void> {
    const stored = await browser.storage.local.get(REPORT_DEDUP_KEY);
    const map = (stored[REPORT_DEDUP_KEY] as Record<string, number> | undefined) ?? {};
    // 古いエントリ (24h 超過) を掃除して肥大化を防ぐ
    const now = Date.now();
    for (const k of Object.keys(map)) {
      if (now - (map[k] ?? 0) > REPORT_DEDUP_WINDOW_MS) delete map[k];
    }
    map[hash] = now;
    await browser.storage.local.set({ [REPORT_DEDUP_KEY]: map });
  }

  // 1-click 報告 (proxy 経由)
  let reportSubmitting = $state(false);
  let reportResult = $state<{ ok: boolean; issueUrl?: string; error?: string; deduped?: boolean } | null>(null);
  async function handleReportError(errorText: string): Promise<void> {
    reportSubmitting = true;
    reportResult = null;
    // dedup チェック: 同種エラーを 24h 以内に既に報告してたら送信スキップ
    const hash = await hashReportKey(errorText);
    const lastTs = await isRecentlyReported(hash);
    if (lastTs !== null) {
      const hours = Math.round((Date.now() - lastTs) / (60 * 60 * 1000));
      reportResult = {
        ok: false,
        deduped: true,
        error: `同じエラーは既に ${hours}h 前に報告済みです (24h cooldown)。`,
      };
      reportSubmitting = false;
      return;
    }
    const { title, body } = await buildReportPayload(errorText);
    try {
      const res = await fetch(REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; issueUrl?: string; error?: string };
      if (res.ok && data.ok) {
        reportResult = { ok: true, issueUrl: data.issueUrl };
        // 成功時のみ dedup 記録 (失敗を再試行したいケースは妨げない)
        void markReported(hash);
      } else {
        reportResult = { ok: false, error: data.error ?? `HTTP ${res.status}` };
      }
    } catch (e) {
      reportResult = { ok: false, error: e instanceof Error ? e.message : String(e) };
    } finally {
      reportSubmitting = false;
    }
  }

  /** fallback: GitHub Issue ページを prefill 付きで開く(proxy 失敗時にユーザーが選択) */
  async function openGitHubIssueDirect(errorText: string): Promise<void> {
    const { title, body } = await buildReportPayload(errorText);
    const url = `https://github.com/komm64/tutti/issues/new?title=${encodeURIComponent('[Tutti Beta] ' + title)}&body=${encodeURIComponent(body)}`;
    try { await navigator.clipboard.writeText(body); } catch { /* ignore */ }
    window.open(url, '_blank');
  }
  // 永続選択を読み込んだあとに autoPost トグルが変わったら保存
  $effect(() => {
    autoPost;
    if (!autoPostLoaded) return;
    void saveSettings({ autoPost });
  });
  const t = (key: string, ...subs: string[]) => browser.i18n.getMessage(key, subs) || key;

  // ログイン中アカウントを popup 起動時に読み込む
  $effect(() => {
    void getLastSeenUsers().then((u) => (lastSeenUsers = u));
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
        // メディアを復元(base64 → Blob → previewUrl)
        if (draft.images && draft.images.length > 0) {
          images = draft.images.map((m) => {
            const bytes = base64ToUint8Array(m.data);
            const blob = new Blob([bytes as BlobPart], { type: m.type });
            return {
              name: m.name,
              type: m.type,
              data: m.data,
              previewUrl: URL.createObjectURL(blob),
            };
          });
        }
        if (draft.video) {
          const bytes = base64ToUint8Array(draft.video.data);
          const blob = new Blob([bytes as BlobPart], { type: draft.video.type });
          video = {
            name: draft.video.name,
            type: draft.video.type,
            data: draft.video.data,
            previewUrl: URL.createObjectURL(blob),
            durationS: draft.video.durationS ?? 0,
          };
        }
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
      const draftImages = images.map((img) => ({
        name: img.name,
        type: img.type,
        data: img.data,
      }));
      const draftVideo = video
        ? { name: video.name, type: video.type, data: video.data, durationS: video.durationS }
        : null;
      void saveDraft({ text, images: draftImages, video: draftVideo });
    }, 300);
  });

  // SNS 選択の永続保存(変わったら即保存)
  let selectedSaveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    selected.x; selected.bluesky; selected.threads;
    selected.mastodon; selected.misskey; selected.tumblr;
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
    history = await getPostHistory();
  }

  async function handleClearHistory() {
    if (!confirm(t('confirmClearHistory'))) return;
    await clearPostHistory();
    history = [];
  }

  // P16: 動画圧縮の進捗 (offscreen から broadcast)
  let compressionProgress = $state<{ stage: 'load' | 'transcode'; progress: number } | null>(null);

  // background からの進捗ストリームを受信
  $effect(() => {
    const listener = (rawMsg: unknown) => {
      const msg = rawMsg as Message;
      if (msg.type === 'PLATFORM_PROGRESS') {
        const r = msg.result;
        lastResults = lastResults
          ? [...lastResults.filter((x) => x.platform !== r.platform), r]
          : [r];
        pendingPlatforms = pendingPlatforms.filter((p) => p !== r.platform);
        // 圧縮 → 投稿に進んだら progress UI 引っ込める
        compressionProgress = null;
        return;
      }
      if (msg.type === 'CONVERSION_PROGRESS') {
        compressionProgress = { stage: msg.stage ?? 'transcode', progress: msg.progress };
        return;
      }
      if (msg.type === 'CONVERSION_COMPLETE' || msg.type === 'CONVERSION_ERROR') {
        compressionProgress = null;
        return;
      }
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

  function toggleHistory() {
    showHistory = !showHistory;
    if (showHistory && history.length === 0) void loadHistory();
  }

  function formatRelTime(ts: number): string {
    const diffS = Math.floor((Date.now() - ts) / 1000);
    if (diffS < 60) return 'たった今';
    if (diffS < 3600) return `${Math.floor(diffS / 60)}分前`;
    if (diffS < 86400) return `${Math.floor(diffS / 3600)}時間前`;
    return `${Math.floor(diffS / 86400)}日前`;
  }

  const selectedIds = $derived(
    platforms
      .filter((p) => p.available && selected[p.id])
      .map((p) => p.id),
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
  const currentKind = $derived.by(() => {
    if (video) return video.durationS > 60 ? 'longVideo' : 'shortVideo';
    if (images.length > 0) return 'image';
    return 'text';
  });
  const canPost = $derived(
    !posting && (text.trim().length > 0 || hasMedia) && selectedIds.length > 0,
  );
  const totalPostCount = $derived(
    selectedIds.reduce((sum, id) => {
      const p = platforms.find((pp) => pp.id === id);
      if (!p) return sum;
      return sum + (text.length > p.limit ? splitText(text, p.limit).length : 1);
    }, 0),
  );
  const videoCompatibility = $derived(
    video
      ? Object.fromEntries(
          platforms.map((p) => [
            p.id,
            checkVideoConstraint(p.id, video!.durationS, base64ByteLength(video!.data)),
          ]),
        )
      : ({} as Record<string, string | null>),
  );
  // 画像サイズは投稿時に自動リサイズされるので、枚数オーバーだけ警告する
  const imageCompatibility = $derived(
    !video && images.length > 0
      ? Object.fromEntries(
          platforms.map((p) => {
            const adapter = getAdapter(p.id);
            if (!adapter) return [p.id, null];
            if (images.length > adapter.imageConstraints.maxImages) {
              return [p.id, `画像が多すぎます(上限 ${adapter.imageConstraints.maxImages} 枚)`];
            }
            return [p.id, null];
          }),
        )
      : ({} as Record<string, string | null>),
  );

  function formatDuration(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function formatBytes(b: number): string {
    return b >= 1024 * 1024
      ? `${(b / 1024 / 1024).toFixed(1)}MB`
      : `${Math.round(b / 1024)}KB`;
  }

  function getVideoDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.onloadedmetadata = () => { resolve(vid.duration); URL.revokeObjectURL(vid.src); };
      vid.onerror = () => resolve(0);
      vid.src = URL.createObjectURL(file);
    });
  }

  async function processFiles(files: File[]) {
    if (files.length === 0) return;
    // 動画と画像が混ざっていたら動画優先(動画 1 ファイルのみ受付)
    const firstVideo = files.find((f) => f.type.startsWith('video/'));
    if (firstVideo) {
      const durationS = await getVideoDuration(firstVideo);
      if (video) URL.revokeObjectURL(video.previewUrl);
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      images = [];
      video = {
        name: firstVideo.name,
        type: firstVideo.type,
        data: arrayBufferToBase64(await firstVideo.arrayBuffer()),
        previewUrl: URL.createObjectURL(firstVideo),
        durationS,
      };
    } else {
      // 画像モード
      if (video) { URL.revokeObjectURL(video.previewUrl); video = null; }
      const slots = MAX_IMAGES - images.length;
      const toAdd = files.filter((f) => f.type.startsWith('image/')).slice(0, slots);
      const newPreviews = await Promise.all(
        toAdd.map(async (f) => ({
          name: f.name,
          type: f.type,
          data: arrayBufferToBase64(await f.arrayBuffer()),
          previewUrl: URL.createObjectURL(f),
        })),
      );
      images = [...images, ...newPreviews];
    }
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

  function isFileDrag(e: DragEvent): boolean {
    return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  }

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
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind !== 'file') continue;
      if (!item.type.startsWith('image/') && !item.type.startsWith('video/')) continue;
      const f = item.getAsFile();
      if (f) files.push(f);
    }
    if (files.length === 0) return; // text-only paste は textarea にそのまま流す
    e.preventDefault();
    await processFiles(files);
  }

  function removeImage(i: number) {
    URL.revokeObjectURL(images[i]!.previewUrl);
    images = images.filter((_, idx) => idx !== i);
  }

  function removeVideo() {
    if (video) URL.revokeObjectURL(video.previewUrl);
    video = null;
  }

  async function handlePost() {
    if (!canPost) return;
    posting = true;
    lastResults = [];
    pendingPlatforms = [...selectedIds];
    errorMessage = null;

    let media: ImageAttachment[];
    if (video) {
      media = [{ name: video.name, type: video.type, data: video.data, durationS: video.durationS }];
    } else if (images.length > 0) {
      // 選択中プラットフォームの最小画像サイズ制約に合わせてリサイズ
      const minLimit = Math.min(
        ...selectedIds
          .map((id) => getAdapter(id)?.imageConstraints.maxBytesPerImage)
          .filter((x): x is number => typeof x === 'number'),
      );
      media = await Promise.all(
        images.map(async (img) => {
          const data = isFinite(minLimit)
            ? await resizeImage(img.data, img.type, minLimit)
            : img.data;
          // リサイズで JPEG になる場合があるので type も再設定
          const resized = data !== img.data;
          return {
            name: resized ? img.name.replace(/\.[^.]+$/, '.jpg') : img.name,
            type: resized ? 'image/jpeg' : img.type,
            data,
          };
        }),
      );
    } else {
      media = [];
    }

    // 大きい media (5MB+) は IndexedDB binary-transfer で運ぶ。sendMessage は
    // 64MB cap があり base64 化した動画 (50MB → 67MB) だと一発で死ぬ
    const wireMedia = await Promise.all(media.map((m) => packAttachmentForTransfer(m)));

    const message: PostRequestMessage = {
      type: 'POST_REQUEST',
      text,
      platforms: selectedIds,
      images: wireMedia.length > 0 ? wireMedia : undefined,
    };

    try {
      const response = (await browser.runtime.sendMessage(message)) as
        | { results?: PostResultMessage[]; error?: string }
        | undefined;
      if (!response) {
        errorMessage = 'background から応答がありませんでした';
      } else if (response.error) {
        errorMessage = response.error;
      } else if (response.results) {
        lastResults = response.results;
        pendingPlatforms = []; // 進捗ストリームの取りこぼし保険
        // 投稿成功(部分成功含む)で下書きをクリア
        if (response.results.some((r) => r.success)) {
          text = '';
          images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
          images = [];
          if (video) URL.revokeObjectURL(video.previewUrl);
          video = null;
          void clearDraft();
        }
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      posting = false;
      pendingPlatforms = [];
      if (showHistory) void loadHistory();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<main
  class="w-96 p-4 bg-white text-gray-900 relative"
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

  <header class="mb-3 flex items-start justify-between">
    <div>
      <h1 class="text-lg font-bold">
        {t('appName')}
        <span class="text-xs font-normal text-gray-400 ml-1">v{version}</span>
        <!-- BETA バッジ: 正式版になったらこの span を削除する -->
        <span
          class="ml-1 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 align-middle tracking-wider"
          title="このバージョンは Beta です。不具合は popup ヘッダの「診断」ボタンから出力をコピーして GitHub Issue へ"
        >BETA</span>
      </h1>
      <p class="text-xs text-gray-500">{t('appTagline')}</p>
    </div>
    <div class="flex items-center gap-2 mt-0.5">
      <button
        onclick={toggleHistory}
        class="text-xs text-gray-400 hover:text-gray-600"
        title={t('historyTitle')}
      >{t('headerHistory')}</button>
      <button
        onclick={runDiagnostics}
        class="text-xs text-gray-400 hover:text-gray-600"
        title={t('diagnosticsHint')}
      >{t('diagnosticsButton')}</button>
      <a
        href={browser.runtime.getURL('options.html')}
        target="_blank"
        class="text-xs text-gray-400 hover:text-gray-600"
        title={t('headerSettings')}
      >{t('headerSettings')}</a>
    </div>
  </header>

  <!-- 自動投稿トグル: 機能の説明と現在状態の説明を分離 -->
  <label
    class="mb-1 flex items-center gap-2 px-3 py-2 rounded border cursor-pointer select-none border-gray-200 bg-white"
  >
    <input type="checkbox" bind:checked={autoPost} class="accent-blue-500" />
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium leading-tight">
        {t('autoPostLabel')}
        <span
          class="ml-1 text-[10px] font-medium px-1.5 py-0.5 rounded align-middle"
          class:bg-blue-200={autoPost}
          class:text-blue-900={autoPost}
          class:bg-gray-200={!autoPost}
          class:text-gray-700={!autoPost}
        >{autoPost ? t('autoPostOn') : t('autoPostOff')}</span>
      </p>
      <p class="text-[11px] text-gray-500 leading-tight mt-0.5">
        {t('autoPostFunctionDesc')}
      </p>
    </div>
  </label>
  <p
    class="mb-3 text-[11px] leading-tight px-3"
    class:text-blue-700={autoPost}
    class:text-amber-700={!autoPost}
  >
    {autoPost ? t('autoPostStateOn') : t('autoPostStateOff')}
  </p>

  <textarea
    bind:value={text}
    onpaste={handlePaste}
    disabled={posting}
    class="w-full h-32 border border-gray-300 rounded p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
    placeholder={t('textareaPlaceholder')}
  ></textarea>

  <!-- メディア添付エリア -->
  <div class="mt-1.5 flex items-center gap-2">
    {#if !video && images.length < MAX_IMAGES}
      <label class="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 cursor-pointer select-none" class:opacity-40={posting}>
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
        </svg>
        {t('addMedia')}
        <input
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
          multiple
          class="hidden"
          disabled={posting}
          onchange={handleMedia}
        />
      </label>
    {/if}
    {#if images.length > 0}
      <span class="text-xs text-gray-400 ml-auto">{images.length}/{MAX_IMAGES}</span>
    {/if}
  </div>

  <!-- 画像サムネイル -->
  {#if images.length > 0}
    <div class="mt-1.5 flex gap-1.5 flex-wrap">
      {#each images as img, i}
        <div class="relative w-16 h-16">
          <img src={img.previewUrl} alt={img.name} class="w-16 h-16 object-cover rounded border border-gray-200" />
          <button onclick={() => removeImage(i)} disabled={posting}
            class="absolute -top-1 -right-1 w-4 h-4 bg-gray-600 text-white rounded-full text-xs leading-none flex items-center justify-center hover:bg-gray-800 disabled:opacity-40">×</button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- 動画プレビュー -->
  {#if video}
    <div class="mt-1.5 flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded text-xs">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
      </svg>
      <div class="flex-1 min-w-0">
        <p class="truncate font-medium text-gray-700">{video.name}</p>
        <p class="text-gray-400">{formatDuration(video.durationS)} · {formatBytes(base64ByteLength(video.data))}</p>
      </div>
      <button onclick={removeVideo} disabled={posting}
        class="shrink-0 text-gray-400 hover:text-gray-700 disabled:opacity-40">✕</button>
    </div>
  {/if}

  {#snippet snsRow(p: PlatformOption)}
    {@const remaining = p.limit - text.length}
    {@const over = remaining < 0}
    {@const parts = over && p.available ? splitText(text, p.limit).length : 1}
    {@const videoErr = videoCompatibility[p.id]}
    {@const imageErr = imageCompatibility[p.id]}
    {@const mediaErr = videoErr || imageErr}
    {@const account = lastSeenUsers[p.id]}
    {@const kindOk = getAdapter(p.id)?.kinds.includes(currentKind) ?? true}
    {@const result = lastResults?.find((r) => r.platform === p.id)}
    {@const isPending = !result && pendingPlatforms.includes(p.id)}
    {@const isQueued = !result && !isPending && posting && selectedIds.includes(p.id)}
    <label
      class="flex items-center gap-2 px-2 py-1.5 border rounded cursor-pointer select-none"
      class:opacity-40={!p.available || !kindOk}
      class:cursor-not-allowed={!p.available}
      class:border-blue-400={isPending}
      class:bg-blue-50={isPending}
      class:border-green-400={result?.success}
      class:bg-green-50={result?.success}
      class:border-red-400={result && !result.success}
      class:bg-red-50={(result && !result.success) || (!!mediaErr && p.available && selected[p.id] && !posting)}
      class:border-orange-400={over && p.available && selected[p.id] && !mediaErr && kindOk && !posting}
      class:bg-orange-50={over && p.available && selected[p.id] && !mediaErr && kindOk && !posting && !result && !isPending}
      class:border-red-300={!!mediaErr && p.available && selected[p.id] && !posting}
      class:border-gray-300={!isPending && !result && !(over && p.available && selected[p.id]) && !(!!mediaErr && p.available && selected[p.id])}
    >
      <input
        type="checkbox"
        bind:checked={selected[p.id]}
        disabled={!p.available || posting}
        class="accent-blue-500"
      />
      <div class="flex flex-col min-w-0 flex-1">
        <span class="font-medium leading-tight">{p.name}</span>
        {#if !posting && !result && account}
          <span class="text-[10px] text-gray-500 truncate leading-tight" title={account}>{account}</span>
        {:else if !posting && !result && p.available}
          <span class="text-[10px] text-gray-300 leading-tight">{t('userUnconfirmed')}</span>
        {:else if isPending}
          <span class="text-[10px] text-blue-600 leading-tight">{autoPost ? t('progressPosting') : t('progressPreviewing')}</span>
        {:else if isQueued}
          <span class="text-[10px] text-gray-400 leading-tight">{t('progressQueued')}</span>
        {:else if result?.success}
          <span class="text-[10px] text-green-700 leading-tight">{autoPost ? t('progressDone') : t('progressDryRunOk')}</span>
        {:else if result && !result.success}
          <span class="text-[10px] text-red-700 leading-tight truncate" title={result.error}>{result.error?.slice(0, 40) ?? '失敗'}</span>
        {/if}
      </div>
      {#if isPending}
        <span class="inline-block w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin shrink-0"></span>
      {:else if isQueued}
        <span class="text-gray-300 shrink-0">⌛</span>
      {:else if result?.success}
        <span class="text-green-600 shrink-0">✓</span>
      {:else if result && !result.success}
        <span class="text-red-600 shrink-0">✗</span>
      {:else if mediaErr && p.available}
        <span class="text-red-500 text-[10px] leading-tight text-right shrink-0">{mediaErr.split('(')[0]?.trim()}</span>
      {:else if over && p.available}
        <span class="text-orange-600 shrink-0">{t('splitParts', String(parts))}</span>
      {:else}
        <span class:text-red-600={over} class="shrink-0">{remaining}</span>
      {/if}
    </label>
  {/snippet}

  {#if signedInPlatforms.length > 0}
    <div class="mt-2 grid grid-cols-2 gap-1.5 text-xs">
      {#each signedInPlatforms as p}
        {@render snsRow(p)}
      {/each}
    </div>
  {/if}
  {#if unsignedPlatforms.length > 0}
    {#if signedInPlatforms.length > 0}
      <p class="mt-2 text-[10px] text-gray-400 uppercase tracking-wider">{t('snsUnsignedSection')}</p>
    {/if}
    <div class="mt-1 grid grid-cols-2 gap-1.5 text-xs">
      {#each unsignedPlatforms as p}
        {@render snsRow(p)}
      {/each}
    </div>
  {/if}

  <button
    onclick={handlePost}
    disabled={!canPost}
    title="Ctrl/Cmd + Enter"
    class="mt-3 w-full py-2 bg-blue-500 text-white rounded font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
  >
    {#if posting}
      {autoPost ? t('posting') : t('previewing')}
    {:else if !autoPost}
      {#if totalPostCount > selectedIds.length}
        {t('postButtonDryRunLong', String(selectedIds.length), String(totalPostCount))}
      {:else}
        {t('postButtonDryRunShort', String(selectedIds.length))}
      {/if}
    {:else if totalPostCount > selectedIds.length}
      {t('postButtonLong', String(selectedIds.length), String(totalPostCount))}
    {:else}
      {t('postButtonShort', String(selectedIds.length))}
    {/if}
  </button>

  {#if errorMessage}
    <div class="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
      <p>{t('errorPrefix')}{errorMessage}</p>
      <button
        onclick={() => handleReportError(errorMessage ?? '')}
        title={t('errorReportHint')}
        class="mt-1.5 inline-block text-[11px] underline text-red-700 hover:text-red-900"
      >{t('errorReportButton')} →</button>
    </div>
  {/if}
  <!-- 失敗した SNS がある場合も同じ Report ボタンを出す(全体 errorMessage と並列) -->
  {#if !posting && lastResults?.some((r) => !r.success)}
    {@const failures = lastResults.filter((r) => !r.success)}
    <div class="mt-2 text-xs text-red-700">
      <button
        onclick={() => handleReportError(failures.map((r) => `${r.platform}: ${r.error ?? '(no detail)'}`).join('\n'))}
        title={t('errorReportHint')}
        class="underline hover:text-red-900"
      >{t('errorReportButton')} ({failures.length}) →</button>
    </div>
  {/if}

  <!-- P16: 動画圧縮中の進捗 (投稿の前段) -->
  {#if posting && compressionProgress}
    <div class="mt-2 flex items-center gap-2 text-[11px]">
      <div class="flex-1 h-1 bg-gray-200 rounded overflow-hidden">
        <div
          class="h-full bg-amber-500 transition-all duration-300"
          style:width="{compressionProgress.stage === 'load' ? 5 : Math.max(5, compressionProgress.progress * 100)}%"
        ></div>
      </div>
      <span class="text-amber-700 shrink-0">
        {compressionProgress.stage === 'load' ? '圧縮ツール読み込み中…' : `動画を圧縮中… ${Math.round(compressionProgress.progress * 100)}%`}
      </span>
    </div>
  {/if}

  <!-- 全体プログレスバー(投稿中のみ表示)。各 SNS の状態は SNS 行に統合済み。 -->
  {#if posting && !compressionProgress}
    {@const totalSelected = selectedIds.length}
    {@const doneCount = lastResults?.length ?? 0}
    <div class="mt-2 flex items-center gap-2 text-[11px]">
      <div class="flex-1 h-1 bg-gray-200 rounded overflow-hidden">
        <div
          class="h-full bg-blue-500 transition-all duration-300"
          style:width="{totalSelected > 0 ? (doneCount / totalSelected) * 100 : 0}%"
        ></div>
      </div>
      <span class="text-gray-500 shrink-0">{doneCount}/{totalSelected}</span>
    </div>
  {/if}

  {#if diagnosticsRunning || diagnosticsText}
    <div class="mt-3 border-t border-gray-100 pt-3">
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs font-medium text-gray-500">{t('diagnosticsButton')}</p>
        <div class="flex gap-2">
          {#if diagnosticsText}
            <button onclick={copyDiagnostics} class="text-[10px] text-gray-400 hover:text-blue-500">
              {diagnosticsCopied ? t('diagnosticsCopied') : t('diagnosticsCopy')}
            </button>
          {/if}
          <button onclick={() => { diagnosticsText = null; }} class="text-[10px] text-gray-400 hover:text-gray-700">{t('diagnosticsClose')}</button>
        </div>
      </div>
      {#if diagnosticsRunning}
        <p class="text-xs text-gray-400">{t('diagnosticsRunning')}</p>
      {:else if diagnosticsText}
        <p class="text-[10px] text-gray-400 mb-1">{t('diagnosticsHint')}</p>
        <pre class="text-[10px] bg-gray-50 border border-gray-200 rounded p-2 max-h-60 overflow-auto whitespace-pre font-mono">{diagnosticsText}</pre>
      {/if}
    </div>
  {/if}

  {#if showHistory}
    <div class="mt-3 border-t border-gray-100 pt-3">
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs font-medium text-gray-500">{t('historyTitle')}</p>
        {#if history.length > 0}
          <button onclick={handleClearHistory} class="text-[10px] text-gray-400 hover:text-red-500">{t('clearAll')}</button>
        {/if}
      </div>
      {#if history.length === 0}
        <p class="text-xs text-gray-400">{t('historyEmpty')}</p>
      {:else}
        <ul class="space-y-1.5">
          {#each history as entry}
            <li class="text-xs border border-gray-100 rounded p-2">
              <div class="flex items-center gap-1.5 mb-0.5">
                {#each entry.platforms as pid}
                  <span
                    class="px-1 rounded text-[10px]"
                    class:bg-green-100={entry.results[pid] === true}
                    class:text-green-700={entry.results[pid] === true}
                    class:bg-red-100={entry.results[pid] === false}
                    class:text-red-700={entry.results[pid] === false}
                  >{pid}</span>
                {/each}
                {#if entry.hasMedia}
                  <span class="text-gray-400">📎</span>
                {/if}
                <span class="ml-auto text-gray-400">{formatRelTime(entry.timestamp)}</span>
              </div>
              <p class="text-gray-600 truncate">{entry.textPreview}</p>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <!-- 障害報告 dialog (proactive: エラー発生時に自動で開く) -->
  {#if errorDialogOpen}
    <div class="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/30">
      <div class="bg-white rounded-lg shadow-xl border border-gray-200 max-w-sm w-full p-4">
        <div class="flex items-start gap-3 mb-3">
          <span class="shrink-0 w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-base">!</span>
          <div class="flex-1 min-w-0">
            <h2 class="text-sm font-bold text-gray-900 leading-tight mb-1">{t('errorDialogTitle')}</h2>
            <p class="text-xs text-gray-700 break-all whitespace-pre-line">{errorDialogText}</p>
          </div>
        </div>

        {#if reportResult?.ok}
          <!-- 報告成功 -->
          <div class="text-xs bg-green-50 border border-green-200 text-green-800 rounded p-2 mb-3">
            <p class="font-medium">{t('errorDialogReported')}</p>
            {#if reportResult.issueUrl}
              <a href={reportResult.issueUrl} target="_blank" class="underline hover:text-green-900 break-all">
                {reportResult.issueUrl}
              </a>
            {/if}
          </div>
          <div class="flex items-center justify-end">
            <button
              onclick={() => { errorDialogOpen = false; reportResult = null; }}
              class="px-3 py-1.5 text-xs font-medium bg-gray-700 text-white rounded hover:bg-gray-800"
            >{t('errorDialogClose')}</button>
          </div>
        {:else if reportResult && reportResult.deduped}
          <!-- 24h cooldown: 同じエラーは既に送信済み。fallback も出さない (= 同じ issue が増えない) -->
          <div class="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded p-2 mb-3">
            <p class="font-medium">既に報告済みです</p>
            <p class="text-[11px] mt-0.5 break-all">{reportResult.error}</p>
          </div>
          <div class="flex items-center justify-end gap-2">
            <button
              onclick={() => { errorDialogOpen = false; reportResult = null; }}
              class="px-3 py-1.5 text-xs font-medium bg-gray-700 text-white rounded hover:bg-gray-800"
            >{t('errorDialogClose')}</button>
          </div>
        {:else if reportResult && !reportResult.ok}
          <!-- 報告失敗 → GitHub URL fallback を提示 -->
          <div class="text-xs bg-red-50 border border-red-200 text-red-800 rounded p-2 mb-3">
            <p class="font-medium">{t('errorDialogReportFailed')}</p>
            <p class="text-[11px] mt-0.5 break-all">{reportResult.error}</p>
          </div>
          <div class="flex items-center justify-end gap-2">
            <button
              onclick={() => { errorDialogOpen = false; reportResult = null; }}
              class="px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded"
            >{t('errorDialogDismiss')}</button>
            <button
              onclick={async () => {
                await openGitHubIssueDirect(errorDialogText);
                errorDialogOpen = false;
                reportResult = null;
              }}
              class="px-3 py-1.5 text-xs font-medium bg-gray-700 text-white rounded hover:bg-gray-800"
            >{t('errorDialogOpenGitHub')}</button>
          </div>
        {:else}
          <!-- 初期状態: 報告するか? -->
          <p class="text-[11px] text-gray-500 leading-snug mb-3">{t('errorDialogBody')}</p>
          <div class="flex items-center justify-end gap-2">
            <button
              onclick={() => { errorDialogOpen = false; }}
              disabled={reportSubmitting}
              class="px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40"
            >{t('errorDialogDismiss')}</button>
            <button
              onclick={() => handleReportError(errorDialogText)}
              disabled={reportSubmitting}
              class="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-red-400 disabled:cursor-wait"
            >{reportSubmitting ? t('errorDialogSubmitting') : t('errorDialogReport')}</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</main>
