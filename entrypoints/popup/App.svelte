<script lang="ts">
  import type { PlatformId, PostRequestMessage, PostResultMessage } from '../../src/messages';

  type PlatformOption = {
    id: PlatformId;
    name: string;
    limit: number;
    /** 未実装プラットフォームは disabled。P3 で順次有効化 */
    available: boolean;
  };

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

  async function handlePost() {
    if (!canPost) return;
    posting = true;
    lastResults = null;
    errorMessage = null;

    const message: PostRequestMessage = {
      type: 'POST_REQUEST',
      text,
      platforms: selectedIds,
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

  <div class="mt-2 grid grid-cols-2 gap-1.5 text-xs">
    {#each platforms as p}
      {@const remaining = p.limit - text.length}
      {@const over = remaining < 0}
      <label
        class="flex items-center gap-2 px-2 py-1.5 border rounded cursor-pointer select-none"
        class:opacity-40={!p.available}
        class:cursor-not-allowed={!p.available}
        class:border-red-400={over && p.available && selected[p.id]}
        class:bg-red-50={over && p.available && selected[p.id]}
        class:border-gray-300={!(over && p.available && selected[p.id])}
      >
        <input
          type="checkbox"
          bind:checked={selected[p.id]}
          disabled={!p.available || posting}
          class="accent-blue-500"
        />
        <span class="font-medium">{p.name}</span>
        <span class="ml-auto" class:text-red-600={over}>{remaining}</span>
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
