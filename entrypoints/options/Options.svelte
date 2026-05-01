<script lang="ts">
  import type { LogEntry, LogLevel } from '../../src/messages';
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
  let logLevel = $state<LogLevel>('INFO');
  let logCount = $state(0);
  let logStatus = $state<string | null>(null);
  let saved = $state(false);
  let loading = $state(true);
  const version = browser.runtime.getManifest().version;
  const t = (key: string) => browser.i18n.getMessage(key) || key;

  $effect(() => {
    void Promise.all([getSettings(), getFetchedAt(), getOverrides()]).then(([s, at, ov]) => {
      mastodonInstance = s.mastodonInstance;
      misskeyInstance = s.misskeyInstance;
      selectorOverrideUrl = s.selectorOverrideUrl;
      logLevel = s.logLevel;
      overrideFetchedAt = at;
      overrideCount = Object.values(ov).reduce((sum, v) => sum + Object.keys(v ?? {}).length, 0);
      loading = false;
    });
    // background から現在の log buffer サイズを取得
    void browser.runtime.sendMessage({ type: 'LOG_EXPORT_REQUEST' }).then((res: unknown) => {
      const r = res as { entries?: LogEntry[] } | undefined;
      logCount = r?.entries?.length ?? 0;
    }).catch(() => { logCount = 0; });
  });

  async function handleDownloadLogs() {
    try {
      const res = (await browser.runtime.sendMessage({ type: 'LOG_EXPORT_REQUEST' })) as { entries?: LogEntry[] } | undefined;
      const entries = res?.entries ?? [];
      const text = entries.map((e) => `[${new Date(e.ts).toISOString()}] ${e.level} (${e.context}) ${e.message}`).join('\n');
      const blob = new Blob([text || '(no logs)'], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tutti-logs-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      logStatus = `✓ ${entries.length} 件のログをダウンロードしました`;
    } catch (e) {
      logStatus = `✗ ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function handleClearLogs() {
    if (!confirm('保存されたログをすべて削除しますか?')) return;
    await browser.runtime.sendMessage({ type: 'LOG_CLEAR' });
    logCount = 0;
    logStatus = '✓ ログをクリアしました';
  }

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
    await saveSettings({ mastodonInstance: m, misskeyInstance: k, selectorOverrideUrl, logLevel });
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

    <section class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">{t('logsTitle')}</h2>
      <div class="space-y-2">
        <label class="block text-sm text-gray-600">{t('logLevelLabel')}</label>
        <select
          bind:value={logLevel}
          class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="OFF">OFF — {t('logLevelOffDesc')}</option>
          <option value="ERROR">ERROR — {t('logLevelErrorDesc')}</option>
          <option value="WARN">WARN — {t('logLevelWarnDesc')}</option>
          <option value="INFO">INFO — {t('logLevelInfoDesc')}</option>
          <option value="DEBUG">DEBUG — {t('logLevelDebugDesc')}</option>
        </select>
        <p class="text-xs text-gray-400">{t('logLevelHint')}</p>
        <div class="flex items-center gap-3 pt-1">
          <button
            onclick={handleDownloadLogs}
            class="px-3 py-1 bg-gray-700 text-white rounded text-xs font-medium hover:bg-gray-800"
          >
            {t('logsDownload')}
          </button>
          <button
            onclick={handleClearLogs}
            class="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-50"
          >
            {t('logsClear')}
          </button>
          <span class="text-xs text-gray-500">{logCount} {t('logsCount')}</span>
        </div>
        {#if logStatus}
          <p class="text-xs" class:text-green-600={logStatus.startsWith('✓')} class:text-red-600={logStatus.startsWith('✗')}>{logStatus}</p>
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
