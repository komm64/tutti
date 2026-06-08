<script lang="ts">
  import type { PlatformId } from '../../../src/messages';
  import type { SnsPreset } from '../../../src/popup/types';
  import { t } from '../../../src/utils/i18n';

  interface Props {
    presets: SnsPreset[];
    selected: Record<PlatformId, boolean>;
    posting: boolean;
    onApply: (preset: SnsPreset) => void;
    onSave: () => void;
    onRemove: (id: string) => void;
  }

  let { presets, selected, posting, onApply, onSave, onRemove }: Props = $props();
  const selectedCount = $derived(Object.values(selected).filter(Boolean).length);
</script>

{#if presets.length > 0 || (selectedCount > 0 && !posting)}
  <div class="mt-2 flex flex-wrap gap-1 items-center text-[10px]">
    {#each presets as preset (preset.id)}
      <div class="inline-flex items-center bg-blue-50 border border-blue-200 rounded">
        <button
          type="button"
          onclick={() => onApply(preset)}
          disabled={posting}
          title={preset.platforms.join(', ')}
          class="px-1.5 py-0.5 text-blue-700 hover:text-blue-900 disabled:opacity-40"
        >{preset.name}</button>
        <button
          type="button"
          onclick={() => onRemove(preset.id)}
          disabled={posting}
          title={t('presetRemoveTooltip')}
          class="px-1 text-blue-400 hover:text-red-600 disabled:opacity-40"
        >×</button>
      </div>
    {/each}
    <button
      type="button"
      onclick={onSave}
      disabled={posting || selectedCount === 0}
      title={t('presetSaveTooltip')}
      class="px-1.5 py-0.5 text-gray-500 hover:text-gray-800 border border-dashed border-gray-300 rounded disabled:opacity-40"
    >+ {t('presetSave')}</button>
  </div>
{/if}
