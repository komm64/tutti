<script lang="ts">
  import type { PlatformId, PostResultMessage } from '../../../src/messages';
  import type { ImagePreview, VideoPreview } from '../../../src/popup/types';
  import { t } from '../../../src/utils/i18n';

  interface Props {
    posting: boolean;
    autoPost: boolean;
    canPost: boolean;
    selectedCount: number;
    totalPostCount: number;
    errorMessage: string | null;
    lastResults: PostResultMessage[] | null;
    text: string;
    images: ImagePreview[];
    video: VideoPreview | null;
    onPost: () => void | Promise<void>;
    onRetryFailed: () => void | Promise<void>;
    onReportError: (text: string) => void | Promise<void>;
    onOpenFailureReportDialog: (text: string) => void;
  }

  let {
    posting,
    autoPost,
    canPost,
    selectedCount,
    totalPostCount,
    errorMessage,
    lastResults,
    text,
    images,
    video,
    onPost,
    onRetryFailed,
    onReportError,
    onOpenFailureReportDialog,
  }: Props = $props();

  const failures = $derived(lastResults?.filter((r) => !r.success) ?? []);
  const definiteFailures = $derived(failures.filter((r) => !r.uncertain));
  const canRetry = $derived(text.trim().length > 0 || images.length > 0 || !!video);
</script>

<button
  onclick={onPost}
  disabled={!canPost}
  title="Ctrl/Cmd + Enter"
  class="mt-3 w-full py-2 bg-blue-500 text-white rounded font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
>
  {#if posting}
    {autoPost ? t('posting') : t('previewing')}
  {:else if !autoPost}
    {#if totalPostCount > selectedCount}
      {t('postButtonDryRunLong', String(selectedCount), String(totalPostCount))}
    {:else}
      {t('postButtonDryRunShort', String(selectedCount))}
    {/if}
  {:else if totalPostCount > selectedCount}
    {t('postButtonLong', String(selectedCount), String(totalPostCount))}
  {:else}
    {t('postButtonShort', String(selectedCount))}
  {/if}
</button>

{#if errorMessage}
  <div class="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
    <p>{t('errorPrefix')}{errorMessage}</p>
    <button
      onclick={() => onReportError(errorMessage ?? '')}
      title={t('errorReportHint')}
      class="mt-1.5 inline-block text-[11px] underline text-red-700 hover:text-red-900"
    >{t('errorReportButton')} →</button>
  </div>
{/if}

{#if !posting && failures.length > 0}
  <div class="mt-2 flex items-center gap-3 text-xs text-red-700">
    {#if definiteFailures.length > 0}
      <button
        onclick={onRetryFailed}
        disabled={!canRetry}
        title={t('retryFailedTooltip', String(definiteFailures.length))}
        class="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
      >{t('retryFailedButton', String(definiteFailures.length))} ↻</button>
    {/if}
    <button
      onclick={() => onOpenFailureReportDialog(
        failures.map((r) => `${r.platform as PlatformId}${r.uncertain ? ' (uncertain)' : ''}: ${r.error ?? '(no detail)'}`).join('\n'),
      )}
      title={t('errorReportHint')}
      class="underline hover:text-red-900"
    >{t('errorReportButton')} →</button>
  </div>
{/if}
