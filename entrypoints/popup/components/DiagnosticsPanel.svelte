<script lang="ts">
  import { t } from '../../../src/utils/i18n';

  interface Props {
    running: boolean;
    text: string | null;
    copied: boolean;
    onCopy: () => void;
    onClose: () => void;
  }

  let { running, text, copied, onCopy, onClose }: Props = $props();
</script>

{#if running || text}
  <div class="mt-3 border-t border-gray-100 pt-3">
    <div class="flex items-center justify-between mb-2">
      <p class="text-xs font-medium text-gray-500">{t('diagnosticsButton')}</p>
      <div class="flex gap-2">
        {#if text}
          <button onclick={onCopy} class="text-[10px] text-gray-400 hover:text-blue-500">
            {copied ? t('diagnosticsCopied') : t('diagnosticsCopy')}
          </button>
        {/if}
        <button onclick={onClose} class="text-[10px] text-gray-400 hover:text-gray-700">{t('diagnosticsClose')}</button>
      </div>
    </div>
    {#if running}
      <p class="text-xs text-gray-400">{t('diagnosticsRunning')}</p>
    {:else if text}
      <p class="text-[10px] text-gray-400 mb-1">{t('diagnosticsHint')}</p>
      <pre class="text-[10px] bg-gray-50 border border-gray-200 rounded p-2 max-h-60 overflow-auto whitespace-pre font-mono">{text}</pre>
    {/if}
  </div>
{/if}
