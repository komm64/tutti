<script lang="ts">
  import { t } from '../../../src/utils/i18n';

  interface Props {
    onStart: () => void | Promise<void>;
    onCancel: () => void;
  }

  let { onStart, onCancel }: Props = $props();
  let starting = $state(false);

  async function start(): Promise<void> {
    if (starting) return;
    starting = true;
    try {
      await onStart();
    } finally {
      starting = false;
    }
  }
</script>

<div class="fixed inset-0 z-[110] flex items-center justify-center bg-gray-950/45 p-3">
  <div
    class="w-full max-w-md rounded-lg bg-white shadow-xl border border-gray-200"
    role="dialog"
    aria-modal="true"
    aria-labelledby="video-posting-title"
    aria-describedby="video-posting-description"
  >
    <div class="p-4 border-b border-gray-100">
      <h2 id="video-posting-title" class="text-base font-semibold text-gray-900">
        {t('videoPostingDialogTitle')}
      </h2>
    </div>

    <div id="video-posting-description" class="p-4 space-y-3 text-sm text-gray-700 leading-relaxed">
      <p>{t('videoPostingDialogLead')}</p>
      <p class="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900 font-medium">
        {t('videoPostingDialogNoOperation')}
      </p>
      <p class="text-xs text-gray-500">{t('videoPostingDialogTiming')}</p>
    </div>

    <div class="flex items-center justify-end gap-2 p-4 border-t border-gray-100">
      <button
        type="button"
        onclick={onCancel}
        disabled={starting}
        class="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:text-gray-400"
      >
        {t('videoPostingDialogCancel')}
      </button>
      <button
        type="button"
        onclick={start}
        disabled={starting}
        class="px-4 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
      >
        {starting ? t('posting') : t('videoPostingDialogStart')}
      </button>
    </div>
  </div>
</div>
