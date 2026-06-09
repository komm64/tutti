<script lang="ts">
  import { TERMS_URL } from '../../../src/storage';
  import { t } from '../../../src/utils/i18n';

  type Props = {
    mode?: 'required' | 'review';
    onAccept: () => void | Promise<void>;
    onDismiss?: () => void;
  };

  let { mode = 'required', onAccept, onDismiss }: Props = $props();
  let accepting = $state(false);

  async function accept(): Promise<void> {
    accepting = true;
    try {
      await onAccept();
    } finally {
      accepting = false;
    }
  }
</script>

<div class="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/45 p-3">
  <div
    class="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-lg bg-white shadow-xl border border-gray-200"
    role="dialog"
    aria-modal="true"
    aria-labelledby="responsible-use-title"
  >
    <div class="p-4 border-b border-gray-100">
      <h2 id="responsible-use-title" class="text-base font-semibold text-gray-900">
        {t('responsibleUseDialogTitle')}
      </h2>
      <p class="mt-2 text-sm text-gray-600 leading-relaxed">
        {t('responsibleUseDialogLead')}
      </p>
    </div>

    <div class="p-4 space-y-3 text-sm text-gray-700 leading-relaxed">
      <ul class="list-disc pl-5 space-y-2">
        <li>{t('responsibleUseDialogPlatformRules')}</li>
        <li>{t('responsibleUseDialogAutomationRisk')}</li>
        <li>{t('responsibleUseDialogNoWarranty')}</li>
        <li>{t('responsibleUseDialogUnaffiliated')}</li>
      </ul>
      <p class="text-xs text-gray-500 leading-relaxed">
        {t('responsibleUseDialogTermsIntro')}
        <a
          href={TERMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          class="text-blue-600 hover:underline"
        >
          {t('responsibleUseDialogTermsLink')}
        </a>
      </p>
    </div>

    <div class="flex items-center justify-end gap-2 p-4 border-t border-gray-100">
      {#if mode === 'review' && onDismiss}
        <button
          type="button"
          onclick={onDismiss}
          class="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          {t('responsibleUseClose')}
        </button>
      {/if}
      <button
        type="button"
        onclick={accept}
        disabled={accepting}
        class="px-4 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
      >
        {accepting ? t('optionsLoading') : t('responsibleUseAccept')}
      </button>
    </div>
  </div>
</div>
