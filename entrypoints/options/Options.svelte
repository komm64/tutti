<script lang="ts">
  import { getSettings, saveSettings } from '../../src/storage';

  let mastodonInstance = $state('https://mastodon.social');
  let misskeyInstance = $state('https://misskey.io');
  let dryRun = $state(false);
  let saved = $state(false);
  let loading = $state(true);
  const version = browser.runtime.getManifest().version;
  const t = (key: string) => browser.i18n.getMessage(key) || key;

  $effect(() => {
    void getSettings().then((s) => {
      mastodonInstance = s.mastodonInstance;
      misskeyInstance = s.misskeyInstance;
      dryRun = s.dryRun ?? false;
      loading = false;
    });
  });

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
    await saveSettings({ mastodonInstance: m, misskeyInstance: k, dryRun });
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
      <h2 class="text-sm font-semibold text-gray-700 mb-3">{t('dryRunTitle')}</h2>
      <label class="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={dryRun}
          class="mt-0.5 accent-amber-500"
        />
        <span class="text-sm text-gray-700">
          {t('dryRunHint')}
        </span>
      </label>
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
