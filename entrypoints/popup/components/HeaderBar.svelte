<script lang="ts">
  import { t } from '../../../src/utils/i18n';

  interface Props {
    version: string;
    diagnosticsRunning: boolean;
    posting: boolean;
    updateAvailableVersion: string | null;
    updateApplying: boolean;
    onOpenHistory: () => void;
    onRunDiagnostics: () => void;
    onApplyUpdate: () => void | Promise<void>;
  }

  let {
    version,
    diagnosticsRunning,
    posting,
    updateAvailableVersion,
    updateApplying,
    onOpenHistory,
    onRunDiagnostics,
    onApplyUpdate,
  }: Props = $props();
</script>

<header class="mb-3 flex items-start justify-between">
  <div>
    <h1 class="text-lg font-bold">
      <a
        href="https://tutti.komm64.com/"
        target="_blank"
        rel="noopener noreferrer"
        class="hover:text-blue-600 transition-colors"
        title={t('appBrandLinkTooltip')}
      >{t('appName')}</a>
      <span class="text-xs font-normal text-gray-400 ml-1">v{version}</span>
      <span
        class="ml-1 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 align-middle tracking-wider"
        title={t('betaBadgeTooltip')}
      >BETA</span>
    </h1>
    <p class="text-xs text-gray-500">{t('appTagline')}</p>
  </div>
  <div class="flex items-center gap-2 mt-0.5">
    {#if updateAvailableVersion}
      <button
        onclick={onApplyUpdate}
        disabled={posting || updateApplying}
        class="text-xs px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:bg-gray-300 disabled:text-white disabled:cursor-not-allowed"
        title={posting ? t('updateApplyAfterPosting') : t('updateAvailableTooltip', updateAvailableVersion)}
      >{updateApplying ? t('updateApplying') : t('updateButton')}</button>
    {/if}
    <button
      onclick={onOpenHistory}
      class="text-xs text-gray-400 hover:text-gray-600"
      title={t('historyTitle')}
    >{t('headerHistory')} ↗</button>
    <button
      onclick={onRunDiagnostics}
      class="text-xs text-gray-400 hover:text-gray-600"
      title={t('diagnosticsHint')}
      disabled={diagnosticsRunning}
    >{t('diagnosticsButton')}</button>
    <a
      href={browser.runtime.getURL('options.html')}
      target="_blank"
      class="text-xs text-gray-400 hover:text-gray-600"
      title={t('headerSettings')}
    >{t('headerSettings')}</a>
  </div>
</header>
