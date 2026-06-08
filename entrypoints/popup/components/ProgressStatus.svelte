<script lang="ts">
  import { t } from '../../../src/utils/i18n';

  interface Props {
    posting: boolean;
    compressionProgress: { stage: 'load' | 'transcode'; progress: number } | null;
    compressionEtaS: number | null;
    doneCount: number;
    totalSelected: number;
  }

  let {
    posting,
    compressionProgress,
    compressionEtaS,
    doneCount,
    totalSelected,
  }: Props = $props();
</script>

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

{#if posting && !compressionProgress}
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
