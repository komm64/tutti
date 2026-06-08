<script lang="ts">
  import type { PlatformId, PostResultMessage } from '../../../src/messages';
  import type { LastSeenUsers } from '../../../src/storage';
  import type { PlatformOption } from '../../../src/popup/types';
  import { getAdapter } from '../../../src/adapters/registry';
  import { measureTextForPlatform, splitTextForPlatform } from '../../../src/utils/platform-text';
  import { classifyFailure, type FailureHintCta } from '../../../src/utils/failure-hint';
  import { t } from '../../../src/utils/i18n';

  interface Props {
    signedInPlatforms: PlatformOption[];
    unsignedPlatforms: PlatformOption[];
    selected: Record<PlatformId, boolean>;
    selectedIds: PlatformId[];
    text: string;
    posting: boolean;
    autoPost: boolean;
    currentKind: 'text' | 'image' | 'shortVideo' | 'longVideo';
    lastSeenUsers: LastSeenUsers;
    pendingPlatforms: PlatformId[];
    lastResults: PostResultMessage[] | null;
    videoCompatibility: Record<string, string | null>;
    imageCompatibility: Record<string, string | null>;
    expandedFailure: PlatformId | null;
    onSelectedChange: (id: PlatformId, checked: boolean) => void;
    onOpenLogin: (id: PlatformId) => void;
    onToggleFailure: (id: PlatformId | null) => void;
    onFailureCta: (id: PlatformId, cta: FailureHintCta) => void | Promise<void>;
  }

  let {
    signedInPlatforms,
    unsignedPlatforms,
    selected,
    selectedIds,
    text,
    posting,
    autoPost,
    currentKind,
    lastSeenUsers,
    pendingPlatforms,
    lastResults,
    videoCompatibility,
    imageCompatibility,
    expandedFailure,
    onSelectedChange,
    onOpenLogin,
    onToggleFailure,
    onFailureCta,
  }: Props = $props();
</script>

{#snippet snsRow(p: PlatformOption)}
  {@const remaining = p.limit - measureTextForPlatform(p.id, text)}
  {@const over = remaining < 0}
  {@const parts = over && p.available ? splitTextForPlatform(p.id, text, p.limit).length : 1}
  {@const videoErr = videoCompatibility[p.id]}
  {@const imageErr = imageCompatibility[p.id]}
  {@const mediaErr = videoErr || imageErr}
  {@const account = lastSeenUsers[p.id]}
  {@const kindOk = getAdapter(p.id)?.kinds.includes(currentKind) ?? true}
  {@const result = lastResults?.find((r) => r.platform === p.id)}
  {@const isPending = !result && pendingPlatforms.includes(p.id)}
  {@const isQueued = !result && !isPending && posting && selectedIds.includes(p.id)}
  <label
    class="flex items-center gap-2 px-2 py-1.5 border rounded cursor-pointer select-none"
    class:opacity-40={!p.available || !kindOk}
    class:cursor-not-allowed={!p.available}
    class:border-blue-400={isPending}
    class:bg-blue-50={isPending}
    class:border-green-400={result?.success}
    class:bg-green-50={result?.success}
    class:border-amber-400={result?.uncertain}
    class:bg-amber-50={result?.uncertain}
    class:border-red-400={result && !result.success && !result.uncertain}
    class:bg-red-50={(result && !result.success && !result.uncertain) || (!!mediaErr && p.available && selected[p.id] && !posting)}
    class:border-orange-400={over && p.available && selected[p.id] && !mediaErr && kindOk && !posting}
    class:bg-orange-50={over && p.available && selected[p.id] && !mediaErr && kindOk && !posting && !result && !isPending}
    class:border-red-300={!!mediaErr && p.available && selected[p.id] && !posting}
    class:border-gray-300={!isPending && !result && !(over && p.available && selected[p.id]) && !(!!mediaErr && p.available && selected[p.id])}
  >
    <input
      type="checkbox"
      checked={selected[p.id]}
      onchange={(e) => onSelectedChange(p.id, (e.currentTarget as HTMLInputElement).checked)}
      disabled={!p.available || posting}
      class="accent-blue-500"
    />
    <div class="flex flex-col min-w-0 flex-1">
      <span class="font-medium leading-tight">{p.name}</span>
      {#if !posting && !result && account}
        <span class="text-[10px] text-gray-500 truncate leading-tight" title={account}>{account}</span>
      {:else if !posting && !result && p.available}
        <button
          type="button"
          onclick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenLogin(p.id); }}
          class="text-left text-[10px] text-blue-500 hover:text-blue-700 hover:underline leading-tight"
          title={t('openLoginTooltip')}
        >{t('userUnconfirmed')} ↗</button>
      {:else if isPending}
        <span class="text-[10px] text-blue-600 leading-tight">{autoPost ? t('progressPosting') : t('progressPreviewing')}</span>
      {:else if isQueued}
        <span class="text-[10px] text-gray-400 leading-tight">{t('progressQueued')}</span>
      {:else if result?.success}
        <span class="text-[10px] text-green-700 leading-tight">{autoPost ? t('progressDone') : t('progressDryRunOk')}</span>
      {:else if result?.uncertain}
        <span class="text-[10px] text-amber-700 leading-tight truncate" title={result.error}>{t('progressUncertain')}</span>
      {:else if result && !result.success}
        <span class="text-[10px] text-red-700 leading-tight truncate" title={result.error}>{result.error?.slice(0, 40) ?? t('failedShort')}</span>
      {/if}
    </div>
    {#if isPending}
      <span class="inline-block w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin shrink-0"></span>
    {:else if isQueued}
      <span class="text-gray-300 shrink-0">⌛</span>
    {:else if result?.success && result.url}
      {@const verifyIssues = result.verify?.issues ?? []}
      {@const hasVerifyError = verifyIssues.some((i) => i.severity === 'error')}
      {@const hasVerifyWarn = verifyIssues.some((i) => i.severity === 'warn')}
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        title={hasVerifyError || hasVerifyWarn
          ? verifyIssues.map((i) => `${i.severity === 'error' ? '⚠️' : 'ℹ'} ${i.message}`).join('\n') + '\n\n' + result.url
          : result.url}
        class="shrink-0 leading-none {hasVerifyError ? 'text-orange-600 hover:text-orange-700' : 'text-green-600 hover:text-green-700'}"
        onclick={(e) => e.stopPropagation()}
      >{hasVerifyError ? '⚠↗' : hasVerifyWarn ? '✓⚠' : '✓↗'}</a>
    {:else if result?.success}
      <span class="text-green-600 shrink-0">✓</span>
    {:else if result?.uncertain}
      <button
        type="button"
        onclick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFailure(expandedFailure === p.id ? null : p.id); }}
        class="text-amber-600 shrink-0 hover:text-amber-700 cursor-pointer"
        title={result.error ?? t('failureHintTooltip')}
      >? ⓘ</button>
    {:else if result && !result.success}
      <button
        type="button"
        onclick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFailure(expandedFailure === p.id ? null : p.id); }}
        class="text-red-600 shrink-0 hover:text-red-700 cursor-pointer"
        title={t('failureHintTooltip')}
      >✗ ⓘ</button>
    {:else if mediaErr && p.available}
      <span class="text-red-500 text-[10px] leading-tight text-right shrink-0">{mediaErr.split('(')[0]?.trim()}</span>
    {:else if over && p.available}
      <span class="text-orange-600 shrink-0">{t('splitParts', String(parts))}</span>
    {:else}
      <span class:text-red-600={over} class="shrink-0">{remaining}</span>
    {/if}
  </label>
{/snippet}

{#snippet failureHintCard(p: PlatformOption)}
  {#if expandedFailure === p.id}
    {@const result = lastResults?.find((r) => r.platform === p.id)}
    {@const error = result?.error ?? ''}
    {@const adapter = getAdapter(p.id)}
    {@const loginUrl = adapter?.getLoginUrl?.()}
    {@const hint = classifyFailure(error, p.id, loginUrl)}
    {@const ctas = result?.uncertain ? hint.ctas.filter((cta) => cta.kind !== 'retry') : hint.ctas}
    <div class="col-span-2 border border-red-200 bg-red-50/70 rounded p-2 text-[11px]">
      <p class="font-medium text-red-800 mb-1">{p.name}: {hint.reason}</p>
      <p class="text-red-700 mb-2 leading-snug">{hint.guidance}</p>
      <div class="flex flex-wrap gap-1.5">
        {#each ctas as cta}
          <button
            type="button"
            onclick={() => onFailureCta(p.id, cta)}
            class="px-2 py-1 rounded font-medium text-[11px]"
            class:bg-red-600={cta.kind === 'retry'}
            class:text-white={cta.kind === 'retry'}
            class:hover:bg-red-700={cta.kind === 'retry'}
            class:bg-white={cta.kind !== 'retry'}
            class:border={cta.kind !== 'retry'}
            class:border-red-300={cta.kind !== 'retry'}
            class:text-red-700={cta.kind !== 'retry'}
            class:hover:bg-red-100={cta.kind !== 'retry'}
          >{cta.label}</button>
        {/each}
        <button
          type="button"
          onclick={() => onToggleFailure(null)}
          class="px-2 py-1 text-gray-500 hover:text-gray-700 text-[11px]"
        >{t('failureHintClose')}</button>
      </div>
    </div>
  {/if}
{/snippet}

{#if signedInPlatforms.length > 0}
  <div class="mt-2 grid grid-cols-2 gap-1.5 text-xs">
    {#each signedInPlatforms as p}
      {@render snsRow(p)}
      {@render failureHintCard(p)}
    {/each}
  </div>
{/if}
{#if unsignedPlatforms.length > 0}
  {#if signedInPlatforms.length > 0}
    <p class="mt-2 text-[10px] text-gray-400 uppercase tracking-wider">{t('snsUnsignedSection')}</p>
  {/if}
  <div class="mt-1 grid grid-cols-2 gap-1.5 text-xs">
    {#each unsignedPlatforms as p}
      {@render snsRow(p)}
      {@render failureHintCard(p)}
    {/each}
  </div>
{/if}
