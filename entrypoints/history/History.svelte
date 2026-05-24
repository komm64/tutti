<script lang="ts">
  import type { PlatformId, PostRequestMessage, PostResultMessage } from '../../src/messages';
  import { clearPostHistory, getPostHistory, removeHistoryEntry, type HistoryEntry } from '../../src/storage';
  import { formatRelTime } from '../../src/utils/formatters';
  import { t } from '../../src/utils/i18n';

  let history = $state<HistoryEntry[]>([]);
  let search = $state('');
  let filter = $state<'all' | 'failed' | 'success'>('all');
  let copied = $state<string | null>(null);
  let busy = $state(false);

  async function load(): Promise<void> {
    history = await getPostHistory();
  }

  void load();

  // storage.local の postHistory が他 context で更新されたら追随
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['postHistory']) {
      void load();
    }
  });

  const filtered = $derived(history.filter((e) => {
    if (filter === 'failed' && !Object.values(e.results).some((r) => r && !r.success)) return false;
    if (filter === 'success' && Object.values(e.results).some((r) => r && !r.success)) return false;
    const q = search.trim().toLowerCase();
    if (q && !(e.text ?? e.textPreview).toLowerCase().includes(q)) return false;
    return true;
  }));

  function fmtFullTime(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number): string => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm(t('historyDeleteConfirm'))) return;
    await removeHistoryEntry(id);
    await load();
  }

  async function handleClearAll(): Promise<void> {
    if (!confirm(t('historyClearAllConfirm'))) return;
    await clearPostHistory();
    await load();
  }

  async function handleCopy(text: string, id: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copied = id;
      setTimeout(() => { if (copied === id) copied = null; }, 1500);
    } catch (e) {
      console.error('clipboard failed', e);
    }
  }

  async function handleExport(): Promise<void> {
    const data = JSON.stringify(history, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tutti-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 履歴 entry から再投稿。 「failed のみ」 と 「全 SNS」 の 2 つ。
   * POST_REQUEST を bg に送るだけで完結 (popup を経由しない)。
   */
  async function handleRepost(entry: HistoryEntry, mode: 'failed' | 'all'): Promise<void> {
    const targets: PlatformId[] = mode === 'failed'
      ? (Object.entries(entry.results) as [PlatformId, { success: boolean }][])
        .filter(([, r]) => !r.success)
        .map(([id]) => id)
      : entry.platforms;
    if (targets.length === 0) return;
    if (!confirm(t('historyRepostConfirm', `${targets.length}`))) return;
    busy = true;
    try {
      const text = entry.text ?? entry.textPreview;
      const req: PostRequestMessage = { type: 'POST_REQUEST', text, platforms: targets };
      const res = await chrome.runtime.sendMessage(req);
      const results = (res as { results?: PostResultMessage[] }).results ?? [];
      const fails = results.filter((r) => !r.success);
      if (fails.length === 0) {
        alert(t('historyRepostAllOk'));
      } else {
        alert(t('historyRepostFailed', fails.map((r) => r.platform).join(', ')));
      }
      await load();
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Tutti — History</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 text-gray-900">
  <div class="max-w-3xl mx-auto p-6">
    <header class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-xl font-bold">{t('historyTitle')}</h1>
        <p class="text-xs text-gray-500 mt-0.5">{filtered.length} / {history.length} {t('historyEntriesUnit')}</p>
      </div>
      <div class="flex gap-2">
        <button
          onclick={handleExport}
          disabled={history.length === 0}
          class="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40"
        >{t('historyExport')}</button>
        <button
          onclick={handleClearAll}
          disabled={history.length === 0}
          class="px-3 py-1.5 text-xs font-medium border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-40"
        >{t('clearAll')}</button>
      </div>
    </header>

    <div class="mb-4 flex gap-2">
      <input
        type="text"
        bind:value={search}
        placeholder={t('historySearchPlaceholder')}
        class="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <select
        bind:value={filter}
        class="border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        <option value="all">{t('historyFilterAll')}</option>
        <option value="failed">{t('historyFilterFailed')}</option>
        <option value="success">{t('historyFilterSuccess')}</option>
      </select>
    </div>

    {#if history.length === 0}
      <p class="text-sm text-gray-500 text-center py-10">{t('historyEmpty')}</p>
    {:else if filtered.length === 0}
      <p class="text-sm text-gray-500 text-center py-10">{t('historyNoMatch')}</p>
    {:else}
      <ul class="space-y-3">
        {#each filtered as entry (entry.id)}
          {@const hasFailures = Object.values(entry.results).some((r) => r && !r.success)}
          {@const successCount = Object.values(entry.results).filter((r) => r?.success).length}
          {@const totalCount = entry.platforms.length}
          {@const fullText = entry.text ?? entry.textPreview}
          <li class="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div class="flex items-center gap-3 mb-2 text-xs text-gray-500">
              <span class="font-medium {hasFailures ? 'text-red-700' : 'text-green-700'}">
                {successCount}/{totalCount} {hasFailures ? t('historyStatusPartial') : t('historyStatusSuccess')}
              </span>
              {#if entry.hasMedia}
                <span title={t('historyHasMedia')}>📎</span>
              {/if}
              <span class="ml-auto" title={fmtFullTime(entry.timestamp)}>{formatRelTime(entry.timestamp)}</span>
            </div>

            <p class="text-sm text-gray-800 mb-3 break-words whitespace-pre-wrap">{fullText}</p>

            <ul class="space-y-1 mb-3">
              {#each entry.platforms as pid}
                {@const r = entry.results[pid]}
                <li class="flex items-start gap-2 text-xs">
                  {#if r?.success}
                    <span class="shrink-0 w-5 text-green-600 font-bold">✓</span>
                    <span class="shrink-0 w-20 font-medium text-gray-700">{pid}</span>
                    {#if r.url}
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-blue-600 hover:text-blue-800 hover:underline truncate"
                        title={r.url}
                      >{r.url.replace(/^https?:\/\//, '')} ↗</a>
                    {:else}
                      <span class="text-gray-400 italic">{t('historyUrlNotCaptured')}</span>
                    {/if}
                  {:else if r}
                    <span class="shrink-0 w-5 text-red-600 font-bold">✗</span>
                    <span class="shrink-0 w-20 font-medium text-gray-700">{pid}</span>
                    <span class="text-red-700 break-words flex-1 min-w-0">{r.error ?? t('failedShort')}</span>
                  {:else}
                    <span class="shrink-0 w-5 text-gray-400">?</span>
                    <span class="shrink-0 w-20 font-medium text-gray-500">{pid}</span>
                    <span class="text-gray-400 italic">{t('historyNotAttempted')}</span>
                  {/if}
                </li>
              {/each}
            </ul>

            <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
              <button
                onclick={() => handleCopy(fullText, entry.id)}
                class="px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 rounded"
              >📋 {copied === entry.id ? t('historyCopied') : t('historyCopy')}</button>
              {#if hasFailures}
                <button
                  onclick={() => handleRepost(entry, 'failed')}
                  disabled={busy}
                  class="px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 rounded disabled:opacity-40"
                >🔁 {t('historyRetryFailed')}</button>
              {/if}
              <button
                onclick={() => handleRepost(entry, 'all')}
                disabled={busy}
                class="px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-50 rounded disabled:opacity-40"
              >🔁 {t('historyRepostAll')}</button>
              <button
                onclick={() => handleDelete(entry.id)}
                class="ml-auto px-2.5 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-700 rounded"
              >🗑 {t('historyDelete')}</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
