<script lang="ts">
  import { getSettings, saveSettings } from '../../src/storage';
  import {
    fetchOverridesFrom,
    getFetchedAt,
    getOverrides,
  } from '../../src/utils/selector-overrides';

  let mastodonInstance = $state('https://mastodon.social');
  let misskeyInstance = $state('https://misskey.io');
  let selectorOverrideUrl = $state('');
  let overrideFetchedAt = $state<number | null>(null);
  let overrideCount = $state(0);
  let overrideStatus = $state<string | null>(null);
  let overrideFetching = $state(false);
  let saved = $state(false);
  let loading = $state(true);
  const version = browser.runtime.getManifest().version;
  const t = (key: string) => browser.i18n.getMessage(key) || key;

  $effect(() => {
    void Promise.all([getSettings(), getFetchedAt(), getOverrides()]).then(([s, at, ov]) => {
      mastodonInstance = s.mastodonInstance;
      misskeyInstance = s.misskeyInstance;
      selectorOverrideUrl = s.selectorOverrideUrl;
      overrideFetchedAt = at;
      overrideCount = Object.values(ov).reduce((sum, v) => sum + Object.keys(v ?? {}).length, 0);
      loading = false;
    });
  });

  async function handleFetchOverrides() {
    overrideFetching = true;
    overrideStatus = null;
    const result = await fetchOverridesFrom(selectorOverrideUrl);
    overrideFetching = false;
    if (result.ok) {
      overrideStatus = `✓ ${result.count ?? 0} 件の selector override を取得しました`;
      overrideFetchedAt = Date.now();
      overrideCount = result.count ?? 0;
    } else {
      overrideStatus = `✗ ${result.error}`;
    }
  }

  function formatFetchedAt(ts: number | null): string {
    if (!ts) return '(未取得)';
    return new Date(ts).toLocaleString();
  }

  function normalizeUrl(input: string): string | null {
    const url = input.trim().replace(/\/$/, '');
    return url.startsWith('https://') ? url : null;
  }

  async function ensurePermission(url: string, defaultUrl: string): Promise<boolean> {
    if (url === defaultUrl) return true;
    return await browser.permissions.request({ origins: [`${url}/*`] });
  }

  async function handleSave() {
    const m = normalizeUrl(mastodonInstance);
    const k = normalizeUrl(misskeyInstance);
    if (!m || !k) {
      alert(t('alertNeedHttps'));
      return;
    }
    if (!(await ensurePermission(m, 'https://mastodon.social'))) {
      alert(t('alertPermissionDenied'));
      return;
    }
    if (!(await ensurePermission(k, 'https://misskey.io'))) {
      alert(t('alertPermissionDenied'));
      return;
    }
    await saveSettings({ mastodonInstance: m, misskeyInstance: k, selectorOverrideUrl });
    mastodonInstance = m;
    misskeyInstance = k;
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }
</script>

<div class="max-w-lg mx-auto p-6 text-gray-900">
  <h1 class="text-xl font-bold mb-1">
    {t('optionsTitle')}
    <span class="text-sm font-normal text-gray-400 ml-1">v{version}</span>
  </h1>
  <p class="text-sm text-gray-500 mb-6">{t('optionsSubtitle')}</p>

  {#if loading}
    <p class="text-sm text-gray-400">{t('optionsLoading')}</p>
  {:else}
    <section class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">Mastodon</h2>
      <div class="space-y-2">
        <label class="block text-sm text-gray-600">
          {t('instanceUrl')}
          <span class="text-xs text-gray-400 ml-1">{t('instanceHint')}</span>
        </label>
        <input
          type="url"
          bind:value={mastodonInstance}
          placeholder="https://mastodon.social"
          class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <p class="text-xs text-gray-400">{t('mastodonHint')}</p>
      </div>
    </section>

    <section class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">Misskey</h2>
      <div class="space-y-2">
        <label class="block text-sm text-gray-600">
          {t('instanceUrl')}
          <span class="text-xs text-gray-400 ml-1">{t('instanceHint')}</span>
        </label>
        <input
          type="url"
          bind:value={misskeyInstance}
          placeholder="https://misskey.io"
          class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <p class="text-xs text-gray-400">{t('misskeyHint')}</p>
      </div>
    </section>

    <section class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">{t('selectorUpdateTitle')}</h2>
      <div class="space-y-2">
        <label class="block text-sm text-gray-600">{t('selectorUpdateUrl')}</label>
        <input
          type="url"
          bind:value={selectorOverrideUrl}
          placeholder="https://example.com/tutti-selectors.json"
          class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <p class="text-xs text-gray-400">{t('selectorUpdateHint')}</p>
        <div class="flex items-center gap-3 pt-1">
          <button
            onclick={handleFetchOverrides}
            disabled={overrideFetching || !selectorOverrideUrl}
            class="px-3 py-1 bg-gray-700 text-white rounded text-xs font-medium hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {overrideFetching ? t('selectorUpdateFetching') : t('selectorUpdateFetch')}
          </button>
          <span class="text-xs text-gray-500">
            {t('selectorUpdateFetchedAt')}: {formatFetchedAt(overrideFetchedAt)}
            {#if overrideCount > 0}
              ({overrideCount} {t('selectorUpdateActive')})
            {/if}
          </span>
        </div>
        {#if overrideStatus}
          <p class="text-xs" class:text-green-600={overrideStatus.startsWith('✓')} class:text-red-600={overrideStatus.startsWith('✗')}>{overrideStatus}</p>
        {/if}
      </div>
    </section>

    <div class="flex items-center gap-3">
      <button
        onclick={handleSave}
        class="px-4 py-2 bg-blue-500 text-white rounded text-sm font-medium hover:bg-blue-600"
      >
        {t('save')}
      </button>
      {#if saved}
        <span class="text-sm text-green-600">{t('saved')}</span>
      {/if}
    </div>
  {/if}
</div>
