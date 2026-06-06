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
  import { measureTextForPlatform, splitTextForPlatform } from '../../src/utils/platform-text';
  import { redactPII } from '../../src/utils/redact';
  import { formatRelTime, formatDuration, formatBytes } from '../../src/utils/formatters';
  import { classifyFailure, type FailureHintCta } from '../../src/utils/failure-hint';
  import { t } from '../../src/utils/i18n';
  import { getMedia } from '../../src/utils/history-media';

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
  // v0.5.0: 同じ App.svelte を popup.html / sidepanel.html / popup.html?floating=1
  // 3 種類の entry で共用する。 context を URL から検出して width 等 layout を切替。
  const tuttiContext: 'popup' | 'sidepanel' | 'floating' = (() => {
    if (location.pathname.includes('sidepanel.html')) return 'sidepanel';
    if (new URLSearchParams(location.search).get('floating') === '1') return 'floating';
    return 'popup';
  })();

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
  let visibility = $state<'public' | 'unlisted' | 'private' | 'direct'>('public');
  /** v0.4.87: 詳細セクションの展開状態 */
  let showAdvanced = $state(false);
  /**
   * v0.4.90: 動画 trim opt-in (秒数)。 null = trim 無し (default、 CONCEPT 通り「拒否」)。
   * 数値が入れば user が明示的に「切り詰めて投稿」 した状態。 ffmpeg で `-t N` で切る。
   */
  let trimToS = $state<number | null>(null);
  /** v0.4.91: SNS 組み合わせプリセット (Settings から読み込み) */
  let snsPresets = $state<Array<{ id: string; name: string; platforms: PlatformId[] }>>([]);
  // 自動投稿(autoPost): false=dry run(ボタンを押すだけで Compose 確認、実投稿はしない)
  // true=実投稿。デフォルトは false にして、初回ユーザーの誤投稿を防ぐ。
  let autoPost = $state(false);
  let autoPostLoaded = $state(false);
  const version = browser.runtime.getManifest().version;
  $effect(() => {
    void getSettings().then((s) => {
      autoPost = s.autoPost;
      autoPostLoaded = true;
      snsPresets = s.snsPresets ?? [];
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
      const failures = lastResults?.filter((r) => !r.success && !r.uncertain) ?? [];
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

  // redactPII は src/utils/redact.ts に切り出し済 (v0.4.78〜)。
  // 単体 test (src/utils/redact.test.ts) で過去事故 regression を防ぐ。

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
    // Issue body は public tutti-issues に投稿される + auto-triage が読む。
    // user の locale に依らず英語で書く (dev が読める統一形式、 v0.4.82)。
    const title = redactPII(errorText.split('\n')[0]?.slice(0, 80) || 'Tutti error report');
    const sections = [
      '## Error',
      '```',
      redactPII(errorText.slice(0, 800)),
      '```',
      '',
      '## Environment',
      `- Tutti version: ${version}`,
      `- User agent: ${ua}`,
      '',
      '## Recent logs (last 30 entries)',
      '```',
      redactPII(logsExcerpt.slice(0, 6000)) || '(no logs captured)',
      '```',
    ];
    if (diagnoseExcerpt) {
      // worker 側 body cap が 50KB なので、diagnostics は 30KB を上限に切る
      const capped = diagnoseExcerpt.slice(0, 30_000);
      sections.push(
        '',
        '## Diagnostics (for auto-triage — selector audit + redacted DOM snapshot)',
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
    // dedup チェック: 同種エラーを 24h 以内に既に報告してたら送信スキップ。
    // Settings で disableReportDedup=true なら skip (個人 dev で連投したいとき用)。
    const settings = await getSettings();
    const hash = await hashReportKey(errorText);
    if (!settings.disableReportDedup) {
      const lastTs = await isRecentlyReported(hash);
      if (lastTs !== null) {
        const hours = Math.round((Date.now() - lastTs) / (60 * 60 * 1000));
        reportResult = {
          ok: false,
          deduped: true,
          error: t('reportDeduped', String(hours)),
        };
        reportSubmitting = false;
        return;
      }
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
        // 成功時のみ dedup 記録 (失敗を再試行したいケースは妨げない)。
        // disableReportDedup=true なら記録もスキップ (storage clean を保つ)
        if (!settings.disableReportDedup) void markReported(hash);
      } else {
        reportResult = { ok: false, error: data.error ?? `HTTP ${res.status}` };
      }
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
    const { title, body } = await buildReportPayload(errorText);
    try { await navigator.clipboard.writeText(body); } catch { /* ignore */ }
    // GitHub Issues form は URL params で title + body を受け取る。 body は
    // 短縮版 (note + 元 body の先頭 3KB) で URL に乗せる。 残りは clipboard から
    // user が補完する形 (新規 issue form は paste 可能、 long body も貼れる)。
    const shortBody = `${t('reportEmailNote')}\n\n${body.slice(0, 3000)}${body.length > 3000 ? '\n\n' + t('reportClipboardOverflow') : ''}`;
    const url = `https://github.com/komm64/tutti-issues/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(shortBody)}`;
    window.open(url, '_blank');
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

  // popup inline history はサムネイルを直近5件のみ読み込む (多数 entry での IDB 負荷防止)
  const POPUP_THUMB_LIMIT = 5;

  async function loadHistory() {
    const entries = await getPostHistory();
    for (const url of historyThumbUrls) URL.revokeObjectURL(url);
    historyThumbUrls = [];
    const thumbs: Record<string, string[]> = {};
    for (const entry of entries.slice(0, POPUP_THUMB_LIMIT)) {
      if (!entry.mediaRefs?.length) continue;
      const urls: string[] = [];
      for (const ref of entry.mediaRefs) {
        const blob = await getMedia(ref).catch(() => null);
        if (blob?.type.startsWith('image/')) {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          historyThumbUrls.push(url);
        }
      }
      if (urls.length) thumbs[entry.id] = urls;
    }
    history = entries;
    historyThumbs = thumbs;
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

  // v0.5.9〜 popup から 「すべて削除」 は撤去 (History tab へ移行)。
  // clearPostHistory の import も消せるが、 storage 関連で他から使われる可能性に
  // 備えて残す (実害なし、 build に影響しない)。

  // P16: 動画圧縮の進捗 (offscreen から broadcast)
  let compressionProgress = $state<{ stage: 'load' | 'transcode'; progress: number } | null>(null);
  // ETA 計算: 圧縮開始 timestamp と最後に観測した progress から残り時間を推定
  let compressionStartedAt = $state<number | null>(null);
  let compressionEtaS = $state<number | null>(null);

  // P19 / v0.4.63: popup 閉じ→再 open 時、background が保持してる進行状態を
  // 復元する。pending / 完了済 results / 圧縮進捗 を全部復元することで、
  // 「2/7 完了済み、5 投稿中」のような中間状態でも閉じ→開きで正しく表示される。
  // 旧コードは posting boolean だけ復元していたので、再 open すると pending /
  // results が空 → 全 SNS が isQueued (「Queue...」) と誤表示されていた。
  $effect(() => {
    void browser.runtime.sendMessage({ type: 'GET_BG_STATE' }).then((res: unknown) => {
      const r = res as {
        compression?: { stage: 'load' | 'transcode'; progress: number } | null;
        posting?: boolean;
        postingState?: {
          platforms: PlatformId[];
          pending: PlatformId[];
          results: PostResultMessage[];
          done?: boolean;
          finishedAt?: number;
        } | null;
      } | undefined;
      // v0.4.96: posting=true (進行中) でも postingState.done=true (完了済) でも
      // bg が保持してる state を popup に流し込む。 wizard SNS が foreground tab を
      // 開いて popup が閉じた後、 user が再 open したときに 「全部 Queue...」 でも
      // 「結果空」 でもなく、 最終結果 / 進捗 を正しく表示する。
      if (r?.postingState) {
        if (r.posting) {
          // 進行中: pending + results を merge (PLATFORM_PROGRESS との race 対策)
          posting = true;
          const knownDone = new Set((lastResults ?? []).map((x) => x.platform));
          pendingPlatforms = r.postingState.pending.filter((p) => !knownDone.has(p));
          const mergedResults = [...r.postingState.results];
          for (const x of (lastResults ?? [])) {
            const idx = mergedResults.findIndex((y) => y.platform === x.platform);
            if (idx === -1) mergedResults.push(x);
            else mergedResults[idx] = x;
          }
          lastResults = mergedResults;
        } else if (r.postingState.done) {
          // 完了済 (popup を閉じてる間に終わった): 最終結果を表示
          posting = false;
          pendingPlatforms = [];
          // results は信頼できる (bg が直 push したもの)。 popup state は空想定で
          // 直接代入
          lastResults = r.postingState.results.slice();
        }
      } else if (r?.posting) {
        // postingState なしで posting=true は古いコード経路想定 (theoretical)
        posting = true;
      }
      if (r?.compression) {
        compressionProgress = r.compression;
        if (r.compression.stage === 'transcode' && r.compression.progress > 0.05) {
          compressionStartedAt = Date.now();
        }
      }
    }).catch(() => { /* background sleep してたら null 戻り、無視 */ });
  });

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
        // ETA 計算 (transcode stage 中に ~5% 以上進んでいれば推定可能)
        if (msg.stage === 'transcode' && msg.progress > 0.05) {
          if (compressionStartedAt === null) compressionStartedAt = Date.now();
          const elapsed = (Date.now() - compressionStartedAt) / 1000;
          const total = elapsed / msg.progress;
          compressionEtaS = Math.max(0, Math.round(total - elapsed));
        } else if (msg.stage === 'transcode' && compressionStartedAt === null) {
          compressionStartedAt = Date.now();
          compressionEtaS = null;
        } else {
          compressionEtaS = null;
        }
        return;
      }
      if (msg.type === 'CONVERSION_COMPLETE' || msg.type === 'CONVERSION_ERROR') {
        compressionProgress = null;
        compressionStartedAt = null;
        compressionEtaS = null;
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
  async function retryFromHistory(entry: { text?: string; textPreview: string; results: Partial<Record<PlatformId, { success: boolean; uncertain?: boolean; url?: string; error?: string }>>; }): Promise<void> {
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

  // formatRelTime は src/utils/formatters.ts から import (v0.4.80〜、 unit test 可能)

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
      return sum + splitTextForPlatform(p.id, text, p.limit).length;
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
              return [p.id, t('constraintTooManyImages', String(adapter.imageConstraints.maxImages))];
            }
            return [p.id, null];
          }),
        )
      : ({} as Record<string, string | null>),
  );

  // formatDuration / formatBytes は src/utils/formatters.ts から import

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
    // alt 配列も同期 (v0.4.87)
    imageAlts = imageAlts.filter((_, idx) => idx !== i);
  }

  /**
   * v0.4.89: 画像の並び替え。 delta = -1 で 1 つ上、 +1 で 1 つ下と swap。
   * boundary check は呼出 側の disabled で防ぐが念のため。
   */
  /**
   * v0.4.91: preset を適用。 selected を preset の platforms 通りに上書き、
   * 永続化も走らせる (saveSelectedPlatforms 経由)。
   */
  function applyPreset(preset: { id: string; name: string; platforms: PlatformId[] }): void {
    const next: typeof selected = { ...selected };
    for (const id of Object.keys(next) as PlatformId[]) {
      next[id] = preset.platforms.includes(id);
    }
    selected = next;
    void saveSelectedPlatforms(selected);
  }

  /**
   * v0.4.91: 現在 selected を新 preset として保存。 名前は prompt で user 入力。
   */
  async function savePreset(): Promise<void> {
    const name = prompt(t('presetSavePrompt'));
    if (!name?.trim()) return;
    const platforms = (Object.entries(selected) as [PlatformId, boolean][])
      .filter(([, v]) => v)
      .map(([id]) => id);
    if (platforms.length === 0) return;
    const preset = { id: Date.now().toString(36), name: name.trim().slice(0, 30), platforms };
    snsPresets = [...snsPresets, preset];
    await saveSettings({ snsPresets });
  }

  /** v0.4.91: preset を削除 */
  async function removePreset(id: string): Promise<void> {
    if (!confirm(t('presetRemoveConfirm'))) return;
    snsPresets = snsPresets.filter((p) => p.id !== id);
    await saveSettings({ snsPresets });
  }

  function moveImage(i: number, delta: -1 | 1): void {
    const target = i + delta;
    if (target < 0 || target >= images.length) return;
    const nextImages = images.slice();
    [nextImages[i], nextImages[target]] = [nextImages[target]!, nextImages[i]!];
    images = nextImages;
    const nextAlts = imageAlts.slice();
    [nextAlts[i], nextAlts[target]] = [nextAlts[target] ?? '', nextAlts[i] ?? ''];
    imageAlts = nextAlts;
  }

  function removeVideo() {
    if (video) URL.revokeObjectURL(video.previewUrl);
    video = null;
  }

  async function handlePost() {
    if (!canPost) return;
    const uncertainSelected = new Set(
      (lastResults ?? []).filter((r) => r.uncertain).map((r) => r.platform),
    );
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
    const failedIds = lastResults.filter((r) => !r.success && !r.uncertain).map((r) => r.platform);
    if (failedIds.length === 0) return;

    // 同一 bodyHash で直近 10 分以内に成功してる platform を retry 対象から外す
    const dedupedFailedIds = await filterAlreadyLandedPlatforms(failedIds);
    if (dedupedFailedIds.length === 0) {
      // 全部 「実は landed 済」 → retry を実行しない、 既存の失敗表示を成功扱いに置き換え
      const now = Date.now();
      const alreadyLanded = failedIds.map((p) => ({
        type: 'POST_RESULT' as const,
        platform: p,
        success: true,
        error: undefined,
        url: undefined,
        timestamp: now,
        verify: { verified: true, issues: [{
          kind: 'retry-dedup-skipped',
          message: t('retryDedupSkippedHint'),
          severity: 'warn' as const,
        }] },
      }));
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
    return filterRecentPlatforms(candidates, (r) => r.success === true);
  }

  async function filterRecentlyUncertainPlatforms(candidates: PlatformId[]): Promise<PlatformId[]> {
    return filterRecentPlatforms(candidates, (r) => r.uncertain === true);
  }

  async function filterRecentPlatforms(
    candidates: PlatformId[],
    matches: (result: { success: boolean; uncertain?: boolean }) => boolean,
  ): Promise<PlatformId[]> {
    try {
      const { getPostHistory } = await import('../../src/storage');
      const { computeBodyHash, sha256Hex } = await import('../../src/utils/body-hash');
      const history = await getPostHistory();
      // media digest: 簡略化のため text のみで dedup (media 含めると popup での digest 計算が
      // 重い + text 一致だけで連投検出としては十分実用)
      const mediaDigests: string[] = [];
      if (images.length > 0) {
        for (const img of images) {
          // base64 → bytes → sha256
          const bin = atob(img.data);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
          mediaDigests.push(await sha256Hex(bytes));
        }
      } else if (video) {
        const bin = atob(video.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        mediaDigests.push(await sha256Hex(bytes));
      }
      const currentHash = await computeBodyHash(text, mediaDigests);
      const tenMinAgo = Date.now() - 10 * 60 * 1000;
      const safe: PlatformId[] = [];
      for (const p of candidates) {
        const landed = history.some((e) => {
          if (!e.timestamp || e.timestamp < tenMinAgo) return false;
          if (e.bodyHash !== currentHash) return false;
          const r = e.results?.[p];
          return !!r && matches(r);
        });
        if (!landed) safe.push(p);
      }
      return safe;
    } catch {
      // 検出失敗時は安全側に倒さず、 既存挙動 (= 全 candidates retry) で続行
      return candidates;
    }
  }

  async function submitPostFor(platforms: PlatformId[], isRetry: boolean) {
    if (platforms.length === 0) return;
    posting = true;
    if (!isRetry) {
      lastResults = [];
    }
    pendingPlatforms = [...platforms];
    errorMessage = null;

    let media: ImageAttachment[];
    if (video) {
      media = [{ name: video.name, type: video.type, data: video.data, durationS: video.durationS }];
    } else if (images.length > 0) {
      // v0.4.81: per-SNS resize は background 側で行う。 popup では
      // **選択中プラットフォームの最大制約** をヘッダ cap として使い、
      // それ以下なら触らない (= 高品質を可能な限り保つ)。 background が
      // 各 SNS に送る前に `resizeImageInSW` で適切なサイズに縮小する。
      const maxLimit = Math.max(
        ...platforms
          .map((id) => getAdapter(id)?.imageConstraints.maxBytesPerImage)
          .filter((x): x is number => typeof x === 'number'),
        0,
      );
      media = await Promise.all(
        images.map(async (img, idx) => {
          const data = maxLimit > 0
            ? await resizeImage(img.data, img.type, maxLimit)
            : img.data;
          // resize が走ったら JPEG なので type / 拡張子を合わせる
          const resized = data !== img.data;
          return {
            name: resized ? img.name.replace(/\.[^.]+$/, '.jpg') : img.name,
            type: resized ? 'image/jpeg' : img.type,
            data,
            alt: imageAlts[idx] || undefined,
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
      platforms,
      images: wireMedia.length > 0 ? wireMedia : undefined,
      // v0.4.87: 詳細オプション (Mastodon / Misskey API path で使われる)
      cw: cw.trim() || undefined,
      visibility: visibility !== 'public' ? visibility : undefined,
      // v0.4.90: 動画 trim opt-in (user が「切り詰めて投稿」 click したときだけ)
      trimVideoToSeconds: trimToS ?? undefined,
    };

    try {
      const response = (await browser.runtime.sendMessage(message)) as
        | { results?: PostResultMessage[]; error?: string }
        | undefined;
      if (!response) {
        errorMessage = t('backgroundNoResponse');
      } else if (response.error) {
        errorMessage = response.error;
      } else if (response.results) {
        // retry の場合は既存の成功 entries を残してマージ。新規 (= 失敗だった
        // platform の新結果) を上書き、別の platform は既存 entry を維持。
        if (isRetry) {
          const incoming = response.results;
          const incomingIds = new Set(incoming.map((r) => r.platform));
          lastResults = [
            ...(lastResults ?? []).filter((r) => !incomingIds.has(r.platform)),
            ...incoming,
          ];
        } else {
          lastResults = response.results;
        }
        pendingPlatforms = []; // 進捗ストリームの取りこぼし保険
        // 全成功(retry 後を含む)で下書きをクリア。retry 後の lastResults に
        // failure が 1 件でも残ってたら text / media は維持する (= 再々送可能)
        const allSuccess = (lastResults ?? []).every((r) => r.success);
        if (allSuccess) {
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

  <header class="mb-3 flex items-start justify-between">
    <div>
      <h1 class="text-lg font-bold">
        <!-- v0.5.12〜 brand mark を home link 化。 hover で trust signal、 default は地味に。 -->
        <a
          href="https://tutti.komm64.com/"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-blue-600 transition-colors"
          title={t('appBrandLinkTooltip')}
        >{t('appName')}</a>
        <span class="text-xs font-normal text-gray-400 ml-1">v{version}</span>
        <!-- BETA バッジ: 正式版になったらこの span を削除する -->
        <span
          class="ml-1 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 align-middle tracking-wider"
          title={t('betaBadgeTooltip')}
        >BETA</span>
      </h1>
      <p class="text-xs text-gray-500">{t('appTagline')}</p>
    </div>
    <div class="flex items-center gap-2 mt-0.5">
      <button
        onclick={openHistoryTab}
        class="text-xs text-gray-400 hover:text-gray-600"
        title={t('historyTitle')}
      >{t('headerHistory')} ↗</button>
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

  <!-- 画像サムネイル + alt text 入力 + 並び替え (v0.4.87 / 並べ替えは v0.4.89) -->
  {#if images.length > 0}
    <div class="mt-1.5 space-y-1.5">
      {#each images as img, i}
        <div class="flex items-center gap-1.5">
          <div class="relative w-12 h-12 shrink-0">
            <img src={img.previewUrl} alt={img.name} class="w-12 h-12 object-cover rounded border border-gray-200" />
            <button onclick={() => removeImage(i)} disabled={posting}
              class="absolute -top-1 -right-1 w-4 h-4 bg-gray-600 text-white rounded-full text-xs leading-none flex items-center justify-center hover:bg-gray-800 disabled:opacity-40">×</button>
          </div>
          <input
            type="text"
            bind:value={imageAlts[i]}
            placeholder={t('altPlaceholder')}
            title={t('altTooltip')}
            maxlength="1500"
            disabled={posting}
            class="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
          />
          {#if images.length > 1}
            <!-- v0.4.89: 並び替え矢印。 ↑ ↓ で 1 つずつ swap。 boundary はそれぞれ無効化 -->
            <div class="flex flex-col gap-0 shrink-0">
              <button
                type="button"
                onclick={() => moveImage(i, -1)}
                disabled={posting || i === 0}
                title={t('moveUpTooltip')}
                class="text-gray-400 hover:text-gray-700 disabled:opacity-30 leading-none text-[10px] px-1"
              >▲</button>
              <button
                type="button"
                onclick={() => moveImage(i, +1)}
                disabled={posting || i === images.length - 1}
                title={t('moveDownTooltip')}
                class="text-gray-400 hover:text-gray-700 disabled:opacity-30 leading-none text-[10px] px-1"
              >▼</button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- 動画プレビュー -->
  {#if video}
    {@const selectedMaxDurs = platforms
      .filter((p) => selected[p.id])
      .map((p) => getAdapter(p.id)?.videoConstraints?.maxDurationS ?? 0)
      .filter((s) => s > 0)}
    {@const minMaxDur = selectedMaxDurs.length > 0 ? Math.min(...selectedMaxDurs) : 0}
    {@const overDur = minMaxDur > 0 && video.durationS > minMaxDur}
    <div class="mt-1.5 flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded text-xs">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
      </svg>
      <div class="flex-1 min-w-0">
        <p class="truncate font-medium text-gray-700">{video.name}</p>
        <p class="text-gray-400">{formatDuration(video.durationS)} · {formatBytes(base64ByteLength(video.data))}</p>
        {#if overDur && !trimToS}
          <!-- v0.4.90: trim opt-in。 default は CONCEPT 通り「拒否」、 user が click したらだけ trim -->
          <button
            type="button"
            onclick={() => (trimToS = minMaxDur)}
            disabled={posting}
            title={t('trimVideoTooltip', String(minMaxDur))}
            class="mt-0.5 text-[10px] text-orange-600 hover:text-orange-700 hover:underline disabled:opacity-40"
          >{t('trimVideoButton', String(minMaxDur))} ✂</button>
        {:else if trimToS}
          <p class="text-[10px] text-orange-600 mt-0.5">
            {t('trimVideoSet', String(trimToS))}
            <button type="button" onclick={() => (trimToS = null)} class="ml-1 text-gray-400 hover:text-gray-700">{t('trimVideoCancel')}</button>
          </p>
        {/if}
      </div>
      <button onclick={removeVideo} disabled={posting}
        class="shrink-0 text-gray-400 hover:text-gray-700 disabled:opacity-40">✕</button>
    </div>
  {/if}

  {#snippet snsRow(p: PlatformOption)}
    {@const remaining = p.limit - measureTextForPlatform(p.id, text)}
    {@const over = remaining < 0}
    {@const parts = over && p.available ? splitTextForPlatform(p.id, text, p.limit).length : 1}
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
      class:border-amber-400={result?.uncertain}
      class:bg-amber-50={result?.uncertain}
      class:border-red-400={result && !result.success && !result.uncertain}
      class:bg-red-50={(result && !result.success && !result.uncertain) || (!!mediaErr && p.available && selected[p.id] && !posting)}
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
          <!-- v0.4.84: unsigned 行は ↗ link 化。 click で SNS の login/home を新 tab で開く。
               <label> の checkbox toggle と競合しないよう preventDefault + stopPropagation。 -->
          <button
            type="button"
            onclick={(e) => { e.preventDefault(); e.stopPropagation(); openLoginUrl(p.id); }}
            class="text-left text-[10px] text-blue-500 hover:text-blue-700 hover:underline leading-tight"
            title={t('openLoginTooltip')}
          >{t('userUnconfirmed')} ↗</button>
        {:else if isPending}
          <span class="text-[10px] text-blue-600 leading-tight">{autoPost ? t('progressPosting') : t('progressPreviewing')}</span>
        {:else if isQueued}
          <span class="text-[10px] text-gray-400 leading-tight">{t('progressQueued')}</span>
        {:else if result?.success}
          <span class="text-[10px] text-green-700 leading-tight">{autoPost ? t('progressDone') : t('progressDryRunOk')}</span>
        {:else if result?.uncertain}
          <span class="text-[10px] text-amber-700 leading-tight truncate" title={result.error}>{t('progressUncertain')}</span>
        {:else if result && !result.success}
          <span class="text-[10px] text-red-700 leading-tight truncate" title={result.error}>{result.error?.slice(0, 40) ?? t('failedShort')}</span>
        {/if}
      </div>
      {#if isPending}
        <span class="inline-block w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin shrink-0"></span>
      {:else if isQueued}
        <span class="text-gray-300 shrink-0">⌛</span>
      {:else if result?.success && result.url}
        {@const verifyIssues = result.verify?.issues ?? []}
        {@const hasVerifyError = verifyIssues.some((i) => i.severity === 'error')}
        {@const hasVerifyWarn = verifyIssues.some((i) => i.severity === 'warn')}
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          title={hasVerifyError || hasVerifyWarn
            ? verifyIssues.map((i) => `${i.severity === 'error' ? '⚠️' : 'ℹ'} ${i.message}`).join('\n') + '\n\n' + result.url
            : result.url}
          class="shrink-0 leading-none {hasVerifyError ? 'text-orange-600 hover:text-orange-700' : 'text-green-600 hover:text-green-700'}"
          onclick={(e) => e.stopPropagation()}
        >{hasVerifyError ? '⚠↗' : hasVerifyWarn ? '✓⚠' : '✓↗'}</a>
      {:else if result?.success}
        <span class="text-green-600 shrink-0">✓</span>
      {:else if result?.uncertain}
        <span class="text-amber-600 shrink-0" title={result.error}>? ⓘ</span>
      {:else if result && !result.success}
        <!-- v0.4.86: ✗ click で failure hint card を toggle -->
        <button
          type="button"
          onclick={(e) => { e.preventDefault(); e.stopPropagation(); expandedFailure = expandedFailure === p.id ? null : p.id; }}
          class="text-red-600 shrink-0 hover:text-red-700 cursor-pointer"
          title={t('failureHintTooltip')}
        >✗ ⓘ</button>
      {:else if mediaErr && p.available}
        <span class="text-red-500 text-[10px] leading-tight text-right shrink-0">{mediaErr.split('(')[0]?.trim()}</span>
      {:else if over && p.available}
        <span class="text-orange-600 shrink-0">{t('splitParts', String(parts))}</span>
      {:else}
        <span class:text-red-600={over} class="shrink-0">{remaining}</span>
      {/if}
    </label>
  {/snippet}

  {#snippet failureHintCard(p: PlatformOption)}
    {#if expandedFailure === p.id}
      {@const result = lastResults?.find((r) => r.platform === p.id)}
      {@const error = result?.error ?? ''}
      {@const adapter = getAdapter(p.id)}
      {@const loginUrl = adapter?.getLoginUrl?.()}
      {@const hint = classifyFailure(error, p.id, loginUrl)}
      <!-- v0.4.86: 失敗の hint card。 grid 2 col の両方を埋めるため col-span-2 -->
      <div class="col-span-2 border border-red-200 bg-red-50/70 rounded p-2 text-[11px]">
        <p class="font-medium text-red-800 mb-1">{p.name}: {hint.reason}</p>
        <p class="text-red-700 mb-2 leading-snug">{hint.guidance}</p>
        <div class="flex flex-wrap gap-1.5">
          {#each hint.ctas as cta}
            <button
              type="button"
              onclick={() => handleFailureCta(p.id, cta)}
              class="px-2 py-1 rounded font-medium text-[11px]"
              class:bg-red-600={cta.kind === 'retry'}
              class:text-white={cta.kind === 'retry'}
              class:hover:bg-red-700={cta.kind === 'retry'}
              class:bg-white={cta.kind !== 'retry'}
              class:border={cta.kind !== 'retry'}
              class:border-red-300={cta.kind !== 'retry'}
              class:text-red-700={cta.kind !== 'retry'}
              class:hover:bg-red-100={cta.kind !== 'retry'}
            >{cta.label}</button>
          {/each}
          <button
            type="button"
            onclick={() => (expandedFailure = null)}
            class="px-2 py-1 text-gray-500 hover:text-gray-700 text-[11px]"
          >{t('failureHintClose')}</button>
        </div>
      </div>
    {/if}
  {/snippet}

  <!-- v0.4.87: 詳細セクション (CW + visibility)。 collapsible で default 閉。 Mastodon / Misskey に届く -->
  <div class="mt-2">
    <button
      type="button"
      onclick={() => (showAdvanced = !showAdvanced)}
      class="text-[10px] text-gray-500 hover:text-gray-700 flex items-center gap-1"
    >
      <span>{showAdvanced ? '▾' : '▸'}</span>
      <span>{t('advancedTitle')}</span>
    </button>
    {#if showAdvanced}
      <div class="mt-1 space-y-1.5 border border-gray-200 rounded p-2 text-xs">
        <div>
          <label class="block text-[10px] text-gray-500 mb-0.5" for="cw-input">{t('cwLabel')}</label>
          <input
            id="cw-input"
            type="text"
            bind:value={cw}
            placeholder={t('cwPlaceholder')}
            maxlength="100"
            disabled={posting}
            class="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
          />
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 mb-0.5" for="visibility-select">{t('visibilityLabel')}</label>
          <select
            id="visibility-select"
            bind:value={visibility}
            disabled={posting}
            class="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
          >
            <option value="public">{t('visibilityPublic')}</option>
            <option value="unlisted">{t('visibilityUnlisted')}</option>
            <option value="private">{t('visibilityPrivate')}</option>
            <option value="direct">{t('visibilityDirect')}</option>
          </select>
        </div>
        <p class="text-[10px] text-gray-400 leading-snug">{t('advancedHint')}</p>
      </div>
    {/if}
  </div>

  <!-- v0.4.91: SNS preset chips -->
  {#if snsPresets.length > 0 || (Object.values(selected).filter(Boolean).length > 0 && !posting)}
    <div class="mt-2 flex flex-wrap gap-1 items-center text-[10px]">
      {#each snsPresets as preset (preset.id)}
        <div class="inline-flex items-center bg-blue-50 border border-blue-200 rounded">
          <button
            type="button"
            onclick={() => applyPreset(preset)}
            disabled={posting}
            title={preset.platforms.join(', ')}
            class="px-1.5 py-0.5 text-blue-700 hover:text-blue-900 disabled:opacity-40"
          >{preset.name}</button>
          <button
            type="button"
            onclick={() => removePreset(preset.id)}
            disabled={posting}
            title={t('presetRemoveTooltip')}
            class="px-1 text-blue-400 hover:text-red-600 disabled:opacity-40"
          >×</button>
        </div>
      {/each}
      <button
        type="button"
        onclick={savePreset}
        disabled={posting || Object.values(selected).filter(Boolean).length === 0}
        title={t('presetSaveTooltip')}
        class="px-1.5 py-0.5 text-gray-500 hover:text-gray-800 border border-dashed border-gray-300 rounded disabled:opacity-40"
      >+ {t('presetSave')}</button>
    </div>
  {/if}

  {#if signedInPlatforms.length > 0}
    <div class="mt-2 grid grid-cols-2 gap-1.5 text-xs">
      {#each signedInPlatforms as p}
        {@render snsRow(p)}
        {@render failureHintCard(p)}
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
        {@render failureHintCard(p)}
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
  <!-- 失敗した SNS がある場合: 再送ボタン + Report ボタンを並べる(全体 errorMessage と並列) -->
  {#if !posting && lastResults?.some((r) => !r.success && !r.uncertain)}
    {@const failures = lastResults.filter((r) => !r.success && !r.uncertain)}
    <div class="mt-2 flex items-center gap-3 text-xs text-red-700">
      <button
        onclick={handleRetryFailed}
        disabled={text.trim().length === 0 && images.length === 0 && !video}
        title={t('retryFailedTooltip', String(failures.length))}
        class="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
      >{t('retryFailedButton', String(failures.length))} ↻</button>
      <button
        onclick={() => {
          // v0.5.7: 直接 fetch せず errorDialog を開く形に統一。 inline 直叩きだと
          // dedup hit / network 失敗時に user に何も feedback されず 「無反応」 と
          // 感じさせていた。 dialog 側に reportResult の表示があるので、 そこに乗せる。
          errorDialogText = failures.map((r) => `${r.platform}: ${r.error ?? '(no detail)'}`).join('\n');
          errorDialogOpen = true;
          reportResult = null;
        }}
        title={t('errorReportHint')}
        class="underline hover:text-red-900"
      >{t('errorReportButton')} →</button>
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
        {#if compressionProgress.stage === 'load'}
          {t('compressionLoading')}
        {:else}
          {t('compressionRunning', String(Math.round(compressionProgress.progress * 100)))}
          {#if compressionEtaS !== null && compressionEtaS > 0}
            <span class="text-amber-600">({compressionEtaS >= 60 ? t('compressionEtaMin', String(Math.ceil(compressionEtaS / 60))) : t('compressionEtaSec', String(compressionEtaS))})</span>
          {/if}
        {/if}
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

  <!-- v0.5.9〜 履歴は popup 下部に常時表示。 詳細・編集・検索は History tab へ。 -->
  <div class="mt-3 border-t border-gray-100 pt-2">
    <div class="flex items-center justify-between mb-1.5">
      <p class="text-xs font-medium text-gray-500">{t('historyTitle')}</p>
      <button
        onclick={openHistoryTab}
        class="text-[10px] text-blue-600 hover:text-blue-800 hover:underline"
      >{t('historyViewAll')}</button>
    </div>
    {#if history.length === 0}
      <p class="text-xs text-gray-400">{t('historyEmpty')}</p>
    {:else}
      <ul class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
        {#each history as entry}
          {@const hasFailures = Object.values(entry.results).some((r) => r && !r.success && !r.uncertain)}
          {@const hasUncertain = Object.values(entry.results).some((r) => r?.uncertain)}
          {@const successCount = Object.values(entry.results).filter((r) => r?.success).length}
          {@const totalCount = entry.platforms.length}
          <li class="text-xs border border-gray-200 rounded p-2">
            <div class="flex items-center gap-1.5 mb-1 text-[11px]">
              <span class="font-medium {hasFailures ? 'text-red-700' : hasUncertain ? 'text-amber-700' : 'text-green-700'}">
                {successCount}/{totalCount}
              </span>
              {#if entry.hasMedia}
                <span class="text-gray-400" title={t('historyHasMedia')}>📎</span>
              {/if}
              <span class="ml-auto text-gray-400">{formatRelTime(entry.timestamp)}</span>
            </div>
            <p class="text-gray-700 mb-1 break-words" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">{entry.text ?? entry.textPreview}</p>
            {#if historyThumbs[entry.id]?.length}
              <div class="flex gap-1 mb-1 flex-wrap">
                {#each historyThumbs[entry.id] as url}
                  <img src={url} alt="" class="h-10 w-10 object-cover rounded border border-gray-200 flex-shrink-0" />
                {/each}
              </div>
            {/if}
            <div class="flex items-center gap-1 text-[10px] text-gray-500">
              {#each entry.platforms as pid}
                {@const r = entry.results[pid]}
                {#if r?.success}
                  {#if r.url}
                    <a href={r.url} target="_blank" rel="noopener noreferrer" class="text-green-600 hover:underline" title={`${pid}: ${r.url}`}>✓{pid.slice(0, 2)}</a>
                  {:else}
                    <span class="text-green-600" title={pid}>✓{pid.slice(0, 2)}</span>
                  {/if}
                {:else if r?.uncertain}
                  <span class="text-amber-600" title={`${pid}: ${r.error ?? ''}`}>?{pid.slice(0, 2)}</span>
                {:else if r}
                  <span class="text-red-600" title={`${pid}: ${r.error ?? ''}`}>✗{pid.slice(0, 2)}</span>
                {:else}
                  <span class="text-gray-400" title={pid}>?{pid.slice(0, 2)}</span>
                {/if}
              {/each}
              {#if hasFailures}
                <button
                  type="button"
                  onclick={() => retryFromHistory(entry)}
                  class="ml-auto text-red-600 hover:text-red-700 hover:underline"
                  title={t('historyRetryFailedTooltip')}
                >↻</button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

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
            <p class="font-medium">{t('reportAlreadySubmitted')}</p>
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
