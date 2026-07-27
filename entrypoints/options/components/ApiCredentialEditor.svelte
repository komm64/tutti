<script lang="ts">
  import type {
    ApiCredentialProviderDescriptor,
  } from '../../../src/options/api-credential-providers';
  import { t } from '../../../src/utils/i18n';

  interface Props {
    provider: ApiCredentialProviderDescriptor;
    primary: string;
    secret: string;
    busy: boolean;
    status: { ok?: boolean; msg: string } | null;
    last: boolean;
    onPrimaryChange: (value: string) => void;
    onSecretChange: (value: string) => void;
    onSave: () => void;
    onClear: () => void;
  }

  let {
    provider,
    primary,
    secret,
    busy,
    status,
    last,
    onPrimaryChange,
    onSecretChange,
    onSave,
    onClear,
  }: Props = $props();
</script>

<div class="space-y-2" class:mb-5={!last} class:pb-4={!last} class:border-b={!last} class:border-gray-200={!last}>
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-medium">{provider.name}</h3>
    <a
      href={provider.helpUrl(primary)}
      target="_blank"
      rel="noopener"
      class="text-xs text-blue-600 hover:underline"
    >{t(provider.helpLabelKey)}</a>
  </div>
  <input
    id={`api-${provider.id}-primary`}
    type={provider.primaryInputType}
    value={primary}
    oninput={(event) => onPrimaryChange((event.currentTarget as HTMLInputElement).value)}
    placeholder={provider.primaryPlaceholder}
    class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
  />
  <input
    id={`api-${provider.id}-secret`}
    type="password"
    value={secret}
    oninput={(event) => onSecretChange((event.currentTarget as HTMLInputElement).value)}
    placeholder={provider.secretPlaceholder}
    class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
  />
  <div class="flex items-center gap-2">
    <button
      type="button"
      onclick={onSave}
      disabled={busy}
      class="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-gray-300"
    >{t('apiTestSave')}</button>
    <button
      type="button"
      onclick={onClear}
      class="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs hover:bg-gray-50"
    >{t('apiClear')}</button>
    {#if status}
      <span
        class="text-xs"
        class:text-green-600={status.ok === true}
        class:text-red-600={status.ok === false}
      >{status.msg}</span>
    {/if}
  </div>
</div>
