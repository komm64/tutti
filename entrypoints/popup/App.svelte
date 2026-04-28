<script lang="ts">
  import type { ImageAttachment, PlatformId, PostRequestMessage, PostResultMessage } from '../../src/messages';
  import { splitText } from '../../src/utils/split';

  type PlatformOption = {
    id: PlatformId;
    name: string;
    limit: number;
    available: boolean;
  };

  type ImagePreview = ImageAttachment & { previewUrl: string };

  const MAX_IMAGES = 4;

  const platforms: PlatformOption[] = [
    { id: 'x', name: 'X', limit: 280, available: true },
    { id: 'bluesky', name: 'Bluesky', limit: 300, available: true },
    { id: 'threads', name: 'Threads', limit: 500, available: false },
    { id: 'mastodon', name: 'Mastodon', limit: 500, available: true },
  ];

  let text = $state('');
  let selected = $state<Record<PlatformId, boolean>>({
    x: true,
    bluesky: true,
    threads: false,
    mastodon: true,
  });
  let images = $state<ImagePreview[]>([]);
  let posting = $state(false);
  let lastResults = $state<PostResultMessage[] | null>(null);
  let errorMessage = $state<string | null>(null);

  const selectedIds = $derived(
    platforms
      .filter((p) => p.available && selected[p.id])
      .map((p) => p.id),
  );
  const canPost = $derived(
    !posting && text.trim().length > 0 && selectedIds.length > 0,
  );

  async function handleFiles(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const slots = MAX_IMAGES - images.length;
    const toAdd = files.slice(0, slots);

    const newPreviews = await Promise.all(
      toAdd.map(async (f) => ({
        name: f.name,
        type: f.type,
        data: await f.arrayBuffer(),
        previewUrl: URL.createObjectURL(f),
      })),
    );
    images = [...images, ...newPreviews];
    // reset input so same file can be re-selected
    input.value = '';
  }

  function removeImage(i: number) {
    URL.revokeObjectURL(images[i]!.previewUrl);
    images = images.filter((_, idx) => idx !== i);
  }

  async function handlePost() {
    if (!canPost) return;
    posting = true;
    lastResults = null;
    errorMessage = null;

    const attachments: ImageAttachment[] = images.map(({ name, type, data }) => ({ name, type, data }));

    const message: PostRequestMessage = {
      type: 'POST_REQUEST',
      text,
      platforms: selectedIds,
      images: attachments.length > 0 ? attachments : undefined,
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
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      posting = false;
    }
  }
</script>

<main class="w-96 p-4 bg-white text-gray-900">
  <header class="mb-3">
    <h1 class="text-lg font-bold">Tutti</h1>
    <p class="text-xs text-gray-500">クロスポストの面倒を全部肩代わり</p>
  </header>

  <textarea
    bind:value={text}
    disabled={posting}
    class="w-full h-32 border border-gray-300 rounded p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
    placeholder="投稿内容を入力..."
  ></textarea>

  <!-- 画像添付エリア -->
  <div class="mt-1.5 flex items-center gap-2">
    {#if images.length < MAX_IMAGES}
      <label
        class="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 cursor-pointer select-none"
        class:opacity-40={posting}
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
        </svg>
        画像を追加
        <input
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          class="hidden"
          disabled={posting}
          onchange={handleFiles}
        />
      </label>
    {/if}
    {#if images.length > 0}
      <span class="text-xs text-gray-400 ml-auto">{images.length}/{MAX_IMAGES}</span>
    {/if}
  </div>

  {#if images.length > 0}
    <div class="mt-1.5 flex gap-1.5 flex-wrap">
      {#each images as img, i}
        <div class="relative w-16 h-16">
          <img
            src={img.previewUrl}
            alt={img.name}
            class="w-16 h-16 object-cover rounded border border-gray-200"
          />
          <button
            onclick={() => removeImage(i)}
            disabled={posting}
            class="absolute -top-1 -right-1 w-4 h-4 bg-gray-600 text-white rounded-full text-xs leading-none flex items-center justify-center hover:bg-gray-800 disabled:opacity-40"
          >×</button>
        </div>
      {/each}
    </div>
  {/if}

  <div class="mt-2 grid grid-cols-2 gap-1.5 text-xs">
    {#each platforms as p}
      {@const remaining = p.limit - text.length}
      {@const over = remaining < 0}
      {@const parts = over && p.available ? splitText(text, p.limit).length : 1}
      <label
        class="flex items-center gap-2 px-2 py-1.5 border rounded cursor-pointer select-none"
        class:opacity-40={!p.available}
        class:cursor-not-allowed={!p.available}
        class:border-orange-400={over && p.available && selected[p.id]}
        class:bg-orange-50={over && p.available && selected[p.id]}
        class:border-gray-300={!(over && p.available && selected[p.id])}
      >
        <input
          type="checkbox"
          bind:checked={selected[p.id]}
          disabled={!p.available || posting}
          class="accent-blue-500"
        />
        <span class="font-medium">{p.name}</span>
        {#if over && p.available}
          <span class="ml-auto text-orange-600">{parts} posts</span>
        {:else}
          <span class="ml-auto" class:text-red-600={over}>{remaining}</span>
        {/if}
      </label>
    {/each}
  </div>

  <button
    onclick={handlePost}
    disabled={!canPost}
    class="mt-3 w-full py-2 bg-blue-500 text-white rounded font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
  >
    {posting ? '投稿中...' : `選択中の ${selectedIds.length} SNS に投稿`}
  </button>

  {#if errorMessage}
    <p class="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
      エラー: {errorMessage}
    </p>
  {/if}

  {#if lastResults}
    <ul class="mt-2 text-xs space-y-1">
      {#each lastResults as r}
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
    </ul>
  {/if}
</main>
