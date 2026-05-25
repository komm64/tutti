<script lang="ts">
  import type { LogEntry, LogLevel } from '../../src/messages';
  import { getSettings, saveSettings } from '../../src/storage';
  import {
    fetchOverridesFrom,
    getFetchedAt,
    getOverrides,
  } from '../../src/utils/selector-overrides';
  import {
    getApiCredentials,
    setApiCredentials,
    clearApiCredentials,
  } from '../../src/utils/api-credentials';
  import { testCredentials as testBluesky } from '../../src/api/bluesky';
  import { testCredentials as testMastodon } from '../../src/api/mastodon';
  import { testCredentials as testMisskey } from '../../src/api/misskey';
  import { t, TUTTI_LOCALES } from '../../src/utils/i18n';

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
  let disableReportDedup = $state(false);
  let autoOpenPostUrl = $state<'always' | 'on-issue' | 'never'>('on-issue');
  let pixivVisibility = $state<'general' | 'r18' | 'r18g'>('general');
  let pixivAiType = $state<'notAiGenerated' | 'aiGenerated'>('notAiGenerated');
  let autoLetterboxVerticalVideo = $state(false);
  let historyKeepMedia = $state(false);
  let notifyInteractions = $state(false);
  let displayMode = $state<'auto' | 'popup' | 'sidepanel' | 'floating'>('auto');
  let uiLanguage = $state<string>('auto');
  let saved = $state(false);
  let loading = $state(true);

  // ── API 連携 (P15 Phase 1: Bluesky / Mastodon / Misskey) ────────
  let bskyId = $state('');
  let bskyPw = $state('');
  let bskyStatus = $state<{ ok?: boolean; msg: string } | null>(null);
  let bskyBusy = $state(false);

  let mstdInstance = $state('https://mastodon.social');
  let mstdToken = $state('');
  let mstdStatus = $state<{ ok?: boolean; msg: string } | null>(null);
  let mstdBusy = $state(false);

  let mskyInstance = $state('https://misskey.io');
  let mskyToken = $state('');
  let mskyStatus = $state<{ ok?: boolean; msg: string } | null>(null);
  let mskyBusy = $state(false);

  const version = browser.runtime.getManifest().version;
  // v0.5.2: t() は src/utils/i18n から import 済。 Settings.uiLanguage で切替可能。

  $effect(() => {
    void Promise.all([getSettings(), getFetchedAt(), getOverrides(), getApiCredentials()]).then(([s, at, ov, creds]) => {
      mastodonInstance = s.mastodonInstance;
      misskeyInstance = s.misskeyInstance;
      selectorOverrideUrl = s.selectorOverrideUrl;
      logLevel = s.logLevel;
      disableReportDedup = s.disableReportDedup;
      autoOpenPostUrl = s.autoOpenPostUrl;
      pixivVisibility = s.pixivVisibility;
      pixivAiType = s.pixivAiType;
      autoLetterboxVerticalVideo = s.autoLetterboxVerticalVideo;
      historyKeepMedia = s.historyKeepMedia ?? false;
      notifyInteractions = s.notifyInteractions ?? false;
      displayMode = s.displayMode ?? 'auto';
      uiLanguage = s.uiLanguage ?? 'auto';
      overrideFetchedAt = at;
      overrideCount = Object.values(ov).reduce((sum, v) => sum + Object.keys(v ?? {}).length, 0);
      // API credentials のロード (パスワード / トークンは UI に出すと見えるので
      // 既存値が居れば「設定済」表示だけにし、再入力時のみ更新する設計でもいいが、
      // 簡単のため bind で出す。option page は user 自身しか見ないので妥当)
      if (creds.bluesky) {
        bskyId = creds.bluesky.identifier;
        bskyPw = creds.bluesky.appPassword;
      }
      if (creds.mastodon) {
        mstdInstance = creds.mastodon.instance;
        mstdToken = creds.mastodon.accessToken;
      }
      if (creds.misskey) {
        mskyInstance = creds.misskey.instance;
        mskyToken = creds.misskey.accessToken;
      }
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
      logStatus = `✓ ${t('logsDownloaded', String(entries.length))}`;
    } catch (e) {
      logStatus = `✗ ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function handleClearLogs() {
    if (!confirm(t('logsClearConfirm'))) return;
    await browser.runtime.sendMessage({ type: 'LOG_CLEAR' });
    logCount = 0;
    logStatus = `✓ ${t('logsCleared')}`;
  }

  async function handleFetchOverrides() {
    overrideFetching = true;
    overrideStatus = null;
    const result = await fetchOverridesFrom(selectorOverrideUrl);
    overrideFetching = false;
    if (result.ok) {
      overrideStatus = `✓ ${t('overrideFetched', String(result.count ?? 0))}`;
      overrideFetchedAt = Date.now();
      overrideCount = result.count ?? 0;
    } else {
      overrideStatus = `✗ ${result.error}`;
    }
  }

  function formatFetchedAt(ts: number | null): string {
    if (!ts) return t('overrideNeverFetched');
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

  // ── API 連携 handlers ──────────────────────────────────────────
  // 「テスト & 保存」ボタン: 認証確認 → 通れば保存。失敗時は保存しない (= 既存
  // creds は壊さない)。「解除」ボタンで個別 platform の credentials を削除。
  async function handleBskySave() {
    if (!bskyId.trim() || !bskyPw.trim()) {
      bskyStatus = { ok: false, msg: t('apiBskyMissing') };
      return;
    }
    bskyBusy = true;
    bskyStatus = { msg: t('apiTesting') };
    const result = await testBluesky({ identifier: bskyId.trim(), appPassword: bskyPw.trim() });
    if (result.ok) {
      await setApiCredentials({ bluesky: { identifier: bskyId.trim(), appPassword: bskyPw.trim() } });
      bskyStatus = { ok: true, msg: `✓ ${t('apiConnected', result.identifier ?? '')}` };
    } else {
      bskyStatus = { ok: false, msg: `✗ ${result.error ?? t('apiConnectError')}` };
    }
    bskyBusy = false;
  }
  async function handleBskyClear() {
    await clearApiCredentials('bluesky');
    bskyId = ''; bskyPw = '';
    bskyStatus = { ok: true, msg: `✓ ${t('apiCleared')}` };
  }

  async function handleMstdSave() {
    const inst = normalizeUrl(mstdInstance);
    if (!inst || !mstdToken.trim()) {
      mstdStatus = { ok: false, msg: t('apiInstanceTokenMissing') };
      return;
    }
    if (!(await ensurePermission(inst, 'https://mastodon.social'))) {
      mstdStatus = { ok: false, msg: `✗ ${t('apiHostPermissionDenied')}` };
      return;
    }
    mstdBusy = true;
    mstdStatus = { msg: t('apiTesting') };
    const result = await testMastodon({ instance: inst, accessToken: mstdToken.trim() });
    if (result.ok) {
      await setApiCredentials({ mastodon: { instance: inst, accessToken: mstdToken.trim() } });
      mstdStatus = { ok: true, msg: `✓ ${t('apiConnected', '@' + (result.identifier ?? ''))}` };
    } else {
      mstdStatus = { ok: false, msg: `✗ ${result.error ?? t('apiConnectError')}` };
    }
    mstdBusy = false;
  }
  async function handleMstdClear() {
    await clearApiCredentials('mastodon');
    mstdToken = '';
    mstdStatus = { ok: true, msg: `✓ ${t('apiCleared')}` };
  }

  async function handleMskySave() {
    const inst = normalizeUrl(mskyInstance);
    if (!inst || !mskyToken.trim()) {
      mskyStatus = { ok: false, msg: t('apiInstanceTokenMissing') };
      return;
    }
    if (!(await ensurePermission(inst, 'https://misskey.io'))) {
      mskyStatus = { ok: false, msg: `✗ ${t('apiHostPermissionDenied')}` };
      return;
    }
    mskyBusy = true;
    mskyStatus = { msg: t('apiTesting') };
    const result = await testMisskey({ instance: inst, accessToken: mskyToken.trim() });
    if (result.ok) {
      await setApiCredentials({ misskey: { instance: inst, accessToken: mskyToken.trim() } });
      mskyStatus = { ok: true, msg: `✓ ${t('apiConnected', result.identifier ?? '')}` };
    } else {
      mskyStatus = { ok: false, msg: `✗ ${result.error ?? t('apiConnectError')}` };
    }
    mskyBusy = false;
  }
  async function handleMskyClear() {
    await clearApiCredentials('misskey');
    mskyToken = '';
    mskyStatus = { ok: true, msg: `✓ ${t('apiCleared')}` };
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
    await saveSettings({ mastodonInstance: m, misskeyInstance: k, selectorOverrideUrl, logLevel, disableReportDedup, autoOpenPostUrl, pixivVisibility, pixivAiType, autoLetterboxVerticalVideo, historyKeepMedia, notifyInteractions, displayMode, uiLanguage });
    // disableReportDedup=true にしたら既存の dedup 履歴も clear
    // (再 enable まで storage に dead key が残らないように)
    if (disableReportDedup) {
      void browser.storage.local.remove('reportDedup').catch(() => {});
    }
    mastodonInstance = m;
    misskeyInstance = k;
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }
</script>

<div class="max-w-lg mx-auto p-6 text-gray-900">
  <h1 class="text-xl font-bold mb-1">
    <!-- v0.5.12〜 brand mark を home link 化 ([[komm64_tutti_pages]] への動線) -->
    <a
      href="https://komm64.github.io/tutti/"
      target="_blank"
      rel="noopener noreferrer"
      class="hover:text-blue-600 transition-colors"
      title={t('appBrandLinkTooltip')}
    >{t('optionsTitle')}</a>
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

    <!-- ── API 連携 (上級者向け、Phase 1: Bluesky / Mastodon / Misskey) ── -->
    <section class="mb-6 border border-amber-200 bg-amber-50/40 rounded p-4">
      <h2 class="text-sm font-semibold text-gray-800 mb-1">{t('apiSectionTitle')} <span class="text-xs text-amber-700">{t('apiSectionAdvancedBadge')}</span></h2>
      <p class="text-xs text-gray-500 mb-4 leading-relaxed">{t('apiSectionHint')}</p>

      <!-- Bluesky -->
      <div class="space-y-2 mb-5 pb-4 border-b border-gray-200">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium">Bluesky</h3>
          <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noopener"
             class="text-xs text-blue-600 hover:underline">{t('apiBlueskyMakePassword')}</a>
        </div>
        <input type="text" bind:value={bskyId} placeholder="user.bsky.social"
          class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <input type="password" bind:value={bskyPw} placeholder="xxxx-xxxx-xxxx-xxxx (App Password)"
          class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <div class="flex items-center gap-2">
          <button onclick={handleBskySave} disabled={bskyBusy}
            class="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-gray-300">{t('apiTestSave')}</button>
          <button onclick={handleBskyClear}
            class="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs hover:bg-gray-50">{t('apiClear')}</button>
          {#if bskyStatus}
            <span class="text-xs" class:text-green-600={bskyStatus.ok === true} class:text-red-600={bskyStatus.ok === false}>{bskyStatus.msg}</span>
          {/if}
        </div>
      </div>

      <!-- Mastodon -->
      <div class="space-y-2 mb-5 pb-4 border-b border-gray-200">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium">Mastodon</h3>
          <a href="{mstdInstance}/settings/applications" target="_blank" rel="noopener"
             class="text-xs text-blue-600 hover:underline">{t('apiMastodonMakeApp')}</a>
        </div>
        <input type="url" bind:value={mstdInstance} placeholder="https://mastodon.social"
          class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <input type="password" bind:value={mstdToken} placeholder="access token (write:statuses + write:media)"
          class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <div class="flex items-center gap-2">
          <button onclick={handleMstdSave} disabled={mstdBusy}
            class="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-gray-300">{t('apiTestSave')}</button>
          <button onclick={handleMstdClear}
            class="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs hover:bg-gray-50">{t('apiClear')}</button>
          {#if mstdStatus}
            <span class="text-xs" class:text-green-600={mstdStatus.ok === true} class:text-red-600={mstdStatus.ok === false}>{mstdStatus.msg}</span>
          {/if}
        </div>
      </div>

      <!-- Misskey -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium">Misskey</h3>
          <a href="{mskyInstance}/settings/api" target="_blank" rel="noopener"
             class="text-xs text-blue-600 hover:underline">{t('apiMisskeyMakeToken')}</a>
        </div>
        <input type="url" bind:value={mskyInstance} placeholder="https://misskey.io"
          class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <input type="password" bind:value={mskyToken} placeholder="access token (write:notes + write:drive)"
          class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <div class="flex items-center gap-2">
          <button onclick={handleMskySave} disabled={mskyBusy}
            class="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-gray-300">{t('apiTestSave')}</button>
          <button onclick={handleMskyClear}
            class="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs hover:bg-gray-50">{t('apiClear')}</button>
          {#if mskyStatus}
            <span class="text-xs" class:text-green-600={mskyStatus.ok === true} class:text-red-600={mskyStatus.ok === false}>{mskyStatus.msg}</span>
          {/if}
        </div>
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
        <!--
          v0.4.82: disableReportDedup の UI 露出は廃止。
          一般 user が ON にすると tutti-issues に同じ報告が連投される anti-feature
          だった (label 文言 "個人 dev で連投したいとき" もそもそも一般 user 向け
          ではない)。 dev console 経由 (chrome.storage.sync.set) で引き続き設定可能、
          Setting field 自体は storage.ts に残してあるので backward compat。
        -->
      </div>
    </section>

    <section class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">{t('pixivTitle')}</h2>
      <div class="space-y-2">
        <label class="block text-sm text-gray-600">{t('pixivVisibilityLabel')}</label>
        <select bind:value={pixivVisibility} class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="general">general — {t('pixivVisibilityGeneralDesc')}</option>
          <option value="r18">R-18 — {t('pixivVisibilityR18Desc')}</option>
          <option value="r18g">R-18G — {t('pixivVisibilityR18gDesc')}</option>
        </select>
        <label class="block text-sm text-gray-600 pt-2">{t('pixivAiTypeLabel')}</label>
        <select bind:value={pixivAiType} class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="notAiGenerated">Not AI — {t('pixivAiTypeNoDesc')}</option>
          <option value="aiGenerated">AI generated — {t('pixivAiTypeYesDesc')}</option>
        </select>
        <p class="text-xs text-gray-400">{t('pixivHint')}</p>
      </div>
    </section>

    <section class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">{t('videoTitle')}</h2>
      <div class="space-y-2">
        <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" bind:checked={autoLetterboxVerticalVideo} class="rounded" />
          <span>{t('autoLetterboxLabel')}</span>
        </label>
        <p class="text-xs text-gray-400">{t('autoLetterboxHint')}</p>
      </div>
    </section>

    <section class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">{t('historyTitle')}</h2>
      <div class="space-y-2">
        <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" bind:checked={historyKeepMedia} class="rounded" />
          <span>{t('historyKeepMediaLabel')}</span>
        </label>
        <p class="text-xs text-gray-400">{t('historyKeepMediaHint')}</p>

        <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pt-3 border-t border-gray-100 mt-2">
          <input type="checkbox" bind:checked={notifyInteractions} class="rounded" />
          <span>{t('notifyInteractionsLabel')}</span>
        </label>
        <p class="text-xs text-gray-400">{t('notifyInteractionsHint')}</p>
      </div>
    </section>

    <section class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">{t('uiLanguageTitle')}</h2>
      <div class="space-y-2">
        <select
          bind:value={uiLanguage}
          class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {#each TUTTI_LOCALES as loc}
            <option value={loc.code}>
              {loc.code === 'auto' ? t('uiLanguageAuto') : `${loc.nativeName} (${loc.englishName})`}
            </option>
          {/each}
        </select>
        <p class="text-xs text-gray-400">{t('uiLanguageHint')}</p>
      </div>
    </section>

    <section class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">{t('displayModeTitle')}</h2>
      <div class="space-y-2">
        <select
          bind:value={displayMode}
          class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="auto">{t('displayModeAutoOption')}</option>
          <option value="popup">{t('displayModePopupOption')}</option>
          <option value="sidepanel">{t('displayModeSidepanelOption')}</option>
          <option value="floating">{t('displayModeFloatingOption')}</option>
        </select>
        <p class="text-xs text-gray-400">{t('displayModeHint')}</p>
      </div>
    </section>

    <section class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">{t('autoOpenTitle')}</h2>
      <div class="space-y-2">
        <label class="block text-sm text-gray-600">{t('autoOpenLabel')}</label>
        <select
          bind:value={autoOpenPostUrl}
          class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="never">never — {t('autoOpenNeverDesc')}</option>
          <option value="on-issue">on-issue — {t('autoOpenOnIssueDesc')}</option>
          <option value="always">always — {t('autoOpenAlwaysDesc')}</option>
        </select>
        <p class="text-xs text-gray-400">{t('autoOpenHint')}</p>
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
