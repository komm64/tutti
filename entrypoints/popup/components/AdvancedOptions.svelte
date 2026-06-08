<script lang="ts">
  import type { Visibility } from '../../../src/popup/types';
  import { t } from '../../../src/utils/i18n';

  interface Props {
    showAdvanced: boolean;
    cw: string;
    visibility: Visibility;
    posting: boolean;
    onToggle: () => void;
    onCwChange: (value: string) => void;
    onVisibilityChange: (value: Visibility) => void;
  }

  let {
    showAdvanced,
    cw,
    visibility,
    posting,
    onToggle,
    onCwChange,
    onVisibilityChange,
  }: Props = $props();
</script>

<div class="mt-2">
  <button
    type="button"
    onclick={onToggle}
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
          value={cw}
          oninput={(e) => onCwChange((e.currentTarget as HTMLInputElement).value)}
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
          value={visibility}
          onchange={(e) => onVisibilityChange((e.currentTarget as HTMLSelectElement).value as Visibility)}
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
