<script lang="ts">
  let text = $state('');

  const platforms = [
    { id: 'x', name: 'X', limit: 280 },
    { id: 'bluesky', name: 'Bluesky', limit: 300 },
    { id: 'threads', name: 'Threads', limit: 500 },
    { id: 'mastodon', name: 'Mastodon', limit: 500 },
  ];

  function handlePost() {
    console.log('[Tutti] post (placeholder):', text);
  }
</script>

<main class="w-96 p-4 bg-white text-gray-900">
  <header class="mb-3">
    <h1 class="text-lg font-bold">Tutti</h1>
    <p class="text-xs text-gray-500">クロスポストの面倒を全部肩代わり</p>
  </header>

  <textarea
    bind:value={text}
    class="w-full h-32 border border-gray-300 rounded p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
    placeholder="投稿内容を入力..."
  ></textarea>

  <div class="mt-2 flex flex-wrap gap-2 text-xs">
    {#each platforms as p}
      {@const remaining = p.limit - text.length}
      {@const over = remaining < 0}
      <span
        class="px-2 py-1 rounded border"
        class:border-red-400={over}
        class:bg-red-50={over}
        class:text-red-600={over}
        class:border-gray-300={!over}
        class:text-gray-600={!over}
      >
        {p.name}: {remaining}
      </span>
    {/each}
  </div>

  <button
    onclick={handlePost}
    disabled={text.length === 0}
    class="mt-3 w-full py-2 bg-blue-500 text-white rounded font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
  >
    全 SNS に投稿
  </button>
</main>
