<script lang="ts">
  import type {
    ImageAttachment,
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
  import {
    clearDraft,
    clearPostHistory,
    getDraft,
    getLastSeenUsers,
    getPostHistory,
    saveDraft,
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

  const platforms: PlatformOption[] = [
    { id: 'x', name: 'X', limit: 280, available: true },
    { id: 'bluesky', name: 'Bluesky', limit: 300, available: true },
    { id: 'threads', name: 'Threads', limit: 500, available: true },
    { id: 'mastodon', name: 'Mastodon', limit: 500, available: true },
    { id: 'misskey', name: 'Misskey', limit: 3000, available: true },
  ];

  let text = $state('');
  let selected = $state<Record<PlatformId, boolean>>({
    x: true,
    bluesky: true,
    threads: true,
    mastodon: true,
    misskey: true,
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
  const version = browser.runtime.getManifest().version;
  const t = (key: string, ...subs: string[]) => browser.i18n.getMessage(key, subs) || key;

  // ログイン中アカウントを popup 起動時に読み込む
  $effect(() => {
    void getLastSeenUsers().then((u) => (lastSeenUsers = u));
  });

  // 下書きを読み込む(マウント時に 1 回)
  $effect(() => {
    if (draftLoaded) return;
    void getDraft().then((draft) => {
      if (draft) {
        text = draft.text;
        for (const [k, v] of Object.entries(draft.selected)) {
          if (typeof v === 'boolean' && k in selected) {
            selected[k as PlatformId] = v;
          }
        }
      }
      draftLoaded = true;
    });
  });

  // 下書き自動保存(text/selected 変更時、300ms デバウンス)
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    // 依存を明示
    text;
    selected.x; selected.bluesky; selected.threads; selected.mastodon;
    if (!draftLoaded) return; // 初回ロード前は保存しない
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void saveDraft({ text, selected });
    }, 300);
  });

  async function loadHistory() {
    history = await getPostHistory();
  }

  async function handleClearHistory() {
    if (!confirm(t('confirmClearHistory'))) return;
    await clearPostHistory();
    history = [];
  }

  // background からの進捗ストリームを受信
  $effect(() => {
    const listener = (rawMsg: unknown) => {
      const msg = rawMsg as Message;
      if (msg.type !== 'PLATFORM_PROGRESS') return;
      const r = msg.result;
      lastResults = lastResults
        ? [...lastResults.filter((x) => x.platform !== r.platform), r]
        : [r];
      pendingPlatforms = pendingPlatforms.filter((p) => p !== r.platform);
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
            checkVideoConstraint(p.id, video!.durationS, video!.data.byteLength),
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

  async function handleMedia(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;

    const first = files[0]!;
    if (first.type.startsWith('video/')) {
      // 動画モード: 最初の1ファイルのみ
      const durationS = await getVideoDuration(first);
      if (video) URL.revokeObjectURL(video.previewUrl);
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      images = [];
      video = {
        name: first.name,
        type: first.type,
        data: await first.arrayBuffer(),
        previewUrl: URL.createObjectURL(first),
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
          data: await f.arrayBuffer(),
          previewUrl: URL.createObjectURL(f),
        })),
      );
      images = [...images, ...newPreviews];
    }
    input.value = '';
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

    const message: PostRequestMessage = {
      type: 'POST_REQUEST',
      text,
      platforms: selectedIds,
      images: media.length > 0 ? media : undefined,
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

<main class="w-96 p-4 bg-white text-gray-900">
  <header class="mb-3 flex items-start justify-between">
    <div>
      <h1 class="text-lg font-bold">
        {t('appName')}
        <span class="text-xs font-normal text-gray-400 ml-1">v{version}</span>
      </h1>
      <p class="text-xs text-gray-500">{t('appTagline')}</p>
    </div>
    <div class="flex items-center gap-2 mt-0.5">
      <button
        onclick={toggleHistory}
        class="text-xs text-gray-400 hover:text-gray-600"
        title={t('historyTitle')}
      >{t('headerHistory')}</button>
      <a
        href={browser.runtime.getURL('options.html')}
        target="_blank"
        class="text-xs text-gray-400 hover:text-gray-600"
        title={t('headerSettings')}
      >{t('headerSettings')}</a>
    </div>
  </header>

  <textarea
    bind:value={text}
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
        <p class="text-gray-400">{formatDuration(video.durationS)} · {formatBytes(video.data.byteLength)}</p>
      </div>
      <button onclick={removeVideo} disabled={posting}
        class="shrink-0 text-gray-400 hover:text-gray-700 disabled:opacity-40">✕</button>
    </div>
  {/if}

  <div class="mt-2 grid grid-cols-2 gap-1.5 text-xs">
    {#each platforms as p}
      {@const remaining = p.limit - text.length}
      {@const over = remaining < 0}
      {@const parts = over && p.available ? splitText(text, p.limit).length : 1}
      {@const videoErr = videoCompatibility[p.id]}
      {@const imageErr = imageCompatibility[p.id]}
      {@const mediaErr = videoErr || imageErr}
      {@const account = lastSeenUsers[p.id]}
      {@const kindOk = getAdapter(p.id)?.kinds.includes(currentKind) ?? true}
      <label
        class="flex items-center gap-2 px-2 py-1.5 border rounded cursor-pointer select-none"
        class:opacity-40={!p.available || !kindOk}
        class:cursor-not-allowed={!p.available}
        class:border-orange-400={over && p.available && selected[p.id] && !mediaErr && kindOk}
        class:bg-orange-50={over && p.available && selected[p.id] && !mediaErr && kindOk}
        class:border-red-300={!!mediaErr && p.available && selected[p.id]}
        class:bg-red-50={!!mediaErr && p.available && selected[p.id]}
        class:border-gray-300={!(over && p.available && selected[p.id]) && !(!!mediaErr && p.available && selected[p.id])}
      >
        <input
          type="checkbox"
          bind:checked={selected[p.id]}
          disabled={!p.available || posting}
          class="accent-blue-500"
        />
        <div class="flex flex-col min-w-0 flex-1">
          <span class="font-medium leading-tight">{p.name}</span>
          {#if account}
            <span class="text-[10px] text-gray-500 truncate leading-tight" title={account}>{account}</span>
          {:else if p.available}
            <span class="text-[10px] text-gray-300 leading-tight">{t('userUnconfirmed')}</span>
          {/if}
        </div>
        {#if mediaErr && p.available}
          <span class="text-red-500 text-[10px] leading-tight text-right shrink-0">{mediaErr.split('(')[0]?.trim()}</span>
        {:else if over && p.available}
          <span class="text-orange-600 shrink-0">{t('splitParts', String(parts))}</span>
        {:else}
          <span class:text-red-600={over} class="shrink-0">{remaining}</span>
        {/if}
      </label>
    {/each}
  </div>

  <button
    onclick={handlePost}
    disabled={!canPost}
    title="Ctrl/Cmd + Enter"
    class="mt-3 w-full py-2 bg-blue-500 text-white rounded font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
  >
    {#if posting}
      {t('posting')}
    {:else if totalPostCount > selectedIds.length}
      {t('postButtonLong', String(selectedIds.length), String(totalPostCount))}
    {:else}
      {t('postButtonShort', String(selectedIds.length))}
    {/if}
  </button>

  {#if errorMessage}
    <p class="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
      {t('errorPrefix')}{errorMessage}
    </p>
  {/if}

  {#if (lastResults && lastResults.length > 0) || pendingPlatforms.length > 0}
    <ul class="mt-2 text-xs space-y-1">
      {#each lastResults ?? [] as r}
        <li class="flex items-start gap-2">
          <span class={r.success ? 'text-green-600' : 'text-red-600'}>
            {r.success ? '✓' : '✗'}
          </span>
          <span class="font-medium">{r.platform}</span>
          {#if !r.success && r.error}
            <span class="text-gray-600">— {r.error}</span>
          {/if}
        </li>
      {/each}
      {#each pendingPlatforms as p}
        <li class="flex items-start gap-2 text-gray-400">
          <span class="inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-400 rounded-full animate-spin"></span>
          <span class="font-medium">{p}</span>
          <span>投稿中...</span>
        </li>
      {/each}
    </ul>
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
</main>
