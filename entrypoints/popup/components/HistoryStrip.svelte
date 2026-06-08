<script lang="ts">
  import type { PlatformId } from '../../../src/messages';
  import type { HistoryEntry } from '../../../src/storage';
  import { formatRelTime } from '../../../src/utils/formatters';
  import { t } from '../../../src/utils/i18n';

  interface Props {
    history: HistoryEntry[];
    historyThumbs: Record<string, string[]>;
    onOpenHistory: () => void;
    onRetry: (entry: HistoryEntry) => void | Promise<void>;
  }

  let { history, historyThumbs, onOpenHistory, onRetry }: Props = $props();
</script>

<div class="mt-3 border-t border-gray-100 pt-2">
  <div class="flex items-center justify-between mb-1.5">
    <p class="text-xs font-medium text-gray-500">{t('historyTitle')}</p>
    <button
      onclick={onOpenHistory}
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
                onclick={() => onRetry(entry)}
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
