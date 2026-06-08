<script lang="ts">
  import type { ReportResult } from '../../../src/popup/types';
  import { t } from '../../../src/utils/i18n';

  interface Props {
    errorText: string;
    reportSubmitting: boolean;
    reportResult: ReportResult | null;
    onDismiss: () => void;
    onResetAndDismiss: () => void;
    onReport: () => void;
    onOpenGitHub: () => void;
  }

  let {
    errorText,
    reportSubmitting,
    reportResult,
    onDismiss,
    onResetAndDismiss,
    onReport,
    onOpenGitHub,
  }: Props = $props();
</script>

<div class="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/30">
  <div class="bg-white rounded-lg shadow-xl border border-gray-200 max-w-sm w-full p-4">
    <div class="flex items-start gap-3 mb-3">
      <span class="shrink-0 w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-base">!</span>
      <div class="flex-1 min-w-0">
        <h2 class="text-sm font-bold text-gray-900 leading-tight mb-1">{t('errorDialogTitle')}</h2>
        <p class="text-xs text-gray-700 break-all whitespace-pre-line">{errorText}</p>
      </div>
    </div>

    {#if reportResult?.ok}
      <div class="text-xs bg-green-50 border border-green-200 text-green-800 rounded p-2 mb-3">
        <p class="font-medium">{t('errorDialogReported')}</p>
        {#if reportResult.issueUrl}
          <a href={reportResult.issueUrl} target="_blank" class="underline hover:text-green-900 break-all">
            {reportResult.issueUrl}
          </a>
        {/if}
      </div>
      <div class="flex items-center justify-end">
        <button
          onclick={onResetAndDismiss}
          class="px-3 py-1.5 text-xs font-medium bg-gray-700 text-white rounded hover:bg-gray-800"
        >{t('errorDialogClose')}</button>
      </div>
    {:else if reportResult && reportResult.deduped}
      <div class="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded p-2 mb-3">
        <p class="font-medium">{t('reportAlreadySubmitted')}</p>
        <p class="text-[11px] mt-0.5 break-all">{reportResult.error}</p>
      </div>
      <div class="flex items-center justify-end gap-2">
        <button
          onclick={onResetAndDismiss}
          class="px-3 py-1.5 text-xs font-medium bg-gray-700 text-white rounded hover:bg-gray-800"
        >{t('errorDialogClose')}</button>
      </div>
    {:else if reportResult && !reportResult.ok}
      <div class="text-xs bg-red-50 border border-red-200 text-red-800 rounded p-2 mb-3">
        <p class="font-medium">{t('errorDialogReportFailed')}</p>
        <p class="text-[11px] mt-0.5 break-all">{reportResult.error}</p>
      </div>
      <div class="flex items-center justify-end gap-2">
        <button
          onclick={onResetAndDismiss}
          class="px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded"
        >{t('errorDialogDismiss')}</button>
        <button
          onclick={onOpenGitHub}
          class="px-3 py-1.5 text-xs font-medium bg-gray-700 text-white rounded hover:bg-gray-800"
        >{t('errorDialogOpenGitHub')}</button>
      </div>
    {:else}
      <p class="text-[11px] text-gray-500 leading-snug mb-3">{t('errorDialogBody')}</p>
      <div class="flex items-center justify-end gap-2">
        <button
          onclick={onDismiss}
          disabled={reportSubmitting}
          class="px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40"
        >{t('errorDialogDismiss')}</button>
        <button
          onclick={onReport}
          disabled={reportSubmitting}
          class="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-red-400 disabled:cursor-wait"
        >{reportSubmitting ? t('errorDialogSubmitting') : t('errorDialogReport')}</button>
      </div>
    {/if}
  </div>
</div>
