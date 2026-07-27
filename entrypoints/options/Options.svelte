<script lang="ts">
  import type { LogEntry, LogLevel } from '../../src/messages';
  import {
    clearPostHistory,
    getSettings,
    saveSettings,
    RESPONSIBLE_USE_ACK_VERSION,
    TERMS_URL,
  } from '../../src/storage';
  import {
    getFetchedAt,
    getOverrides,
  } from '../../src/utils/selector-overrides';
  import { fetchOverridesFrom } from '../../src/utils/selector-feed-runtime';
  import { getApiCredentials } from '../../src/utils/api-credentials';
  import {
    API_CREDENTIAL_PROVIDERS,
    clearProviderApiCredential,
    createApiCredentialEditorStates,
    testAndSaveApiCredential,
    type ApiCredentialProviderDescriptor,
  } from '../../src/options/api-credential-providers';
  import { t, TUTTI_LOCALES } from '../../src/utils/i18n';
  import ResponsibleUseDialog from '../popup/components/ResponsibleUseDialog.svelte';
  import ApiCredentialEditor from './components/ApiCredentialEditor.svelte';

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
  let notifyInteractions = $state(false);
  let displayMode = $state<'auto' | 'popup' | 'sidepanel' | 'floating'>('auto');
  let uiLanguage = $state<string>('auto');
  let responsibleUseAcceptedVersion = $state(0);
  let responsibleUseAcceptedAt = $state<number | null>(null);
  let responsibleUseDialogOpen = $state(false);
  let saved = $state(false);
  let loading = $state(true);
  let historyCleared = $state(false);

  // ── API 連携 (P15 Phase 1: Bluesky / Mastodon / Misskey) ────────
  let credentialEditors = $state(createApiCredentialEditorStates());

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
      notifyInteractions = s.notifyInteractions ?? false;
      displayMode = s.displayMode ?? 'auto';
      uiLanguage = s.uiLanguage ?? 'auto';
      responsibleUseAcceptedVersion = s.responsibleUseAcceptedVersion ?? 0;
      responsibleUseAcceptedAt = s.responsibleUseAcceptedAt ?? null;
      overrideFetchedAt = at;
      overrideCount = Object.values(ov).reduce((sum, v) => sum + Object.keys(v ?? {}).length, 0);
      credentialEditors = createApiCredentialEditorStates(creds);
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
      // Runtime contract: any failed refresh clears remote caches so bundled
      // selectors win. Keep the visible state aligned with that fallback.
      overrideFetchedAt = null;
      overrideCount = 0;
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
  async function handleCredentialSave(
    provider: ApiCredentialProviderDescriptor,
  ): Promise<void> {
    const editor = credentialEditors[provider.id];
    if (!provider.prepare(editor)) {
      editor.status = { ok: false, msg: t(provider.missingMessageKey) };
      return;
    }
    editor.busy = true;
    editor.status = { msg: t('apiTesting') };
    const result = await testAndSaveApiCredential(provider, editor);
    if (result.ok) {
      editor.status = {
        ok: true,
        msg: `✓ ${t(
          'apiConnected',
          provider.formatIdentifier(result.identifier ?? ''),
        )}`,
      };
    } else if (result.reason === 'permission-denied') {
      editor.status = { ok: false, msg: `✗ ${t('apiHostPermissionDenied')}` };
    } else if (result.reason === 'missing') {
      editor.status = { ok: false, msg: t(provider.missingMessageKey) };
    } else {
      editor.status = {
        ok: false,
        msg: `✗ ${result.error ?? t('apiConnectError')}`,
      };
    }
    editor.busy = false;
  }

  async function handleCredentialClear(
    provider: ApiCredentialProviderDescriptor,
  ): Promise<void> {
    await clearProviderApiCredential(provider);
    const editor = credentialEditors[provider.id];
    if (provider.clearPrimaryOnClear) editor.primary = '';
    editor.secret = '';
    editor.status = { ok: true, msg: `✓ ${t('apiCleared')}` };
  }

  async function handleClearHistory() {
    if (!confirm(t('historyClearAllConfirm'))) return;
    await clearPostHistory();
    historyCleared = true;
    setTimeout(() => { historyCleared = false; }, 2000);
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
    await saveSettings({ mastodonInstance: m, misskeyInstance: k, selectorOverrideUrl, logLevel, disableReportDedup, autoOpenPostUrl, pixivVisibility, pixivAiType, autoLetterboxVerticalVideo, notifyInteractions, displayMode, uiLanguage });
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

  async function acceptResponsibleUse(): Promise<void> {
    const acceptedAt = Date.now();
    await saveSettings({
      responsibleUseAcceptedVersion: RESPONSIBLE_USE_ACK_VERSION,
      responsibleUseAcceptedAt: acceptedAt,
    });
    responsibleUseAcceptedVersion = RESPONSIBLE_USE_ACK_VERSION;
    responsibleUseAcceptedAt = acceptedAt;
    responsibleUseDialogOpen = false;
  }

  function formatResponsibleUseAcceptedAt(ts: number | null): string {
    return ts ? new Date(ts).toLocaleString() : '';
  }
</script>

<div class="max-w-lg mx-auto p-6 text-gray-900">
  <h1 class="text-xl font-bold mb-1">
    <!-- v0.5.12〜 brand mark を home link 化 (public site への動線) -->
    <a
      href="https://tutti.komm64.com/"
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
    <section class="mb-6 border border-amber-200 bg-amber-50/50 rounded p-4">
      <h2 class="text-sm font-semibold text-gray-800 mb-2">{t('responsibleUseSettingsTitle')}</h2>
      <p class="text-xs text-gray-600 leading-relaxed mb-3">{t('responsibleUseSettingsBody')}</p>
      <p class="text-xs text-gray-500 mb-3">
        {#if responsibleUseAcceptedVersion >= RESPONSIBLE_USE_ACK_VERSION}
          {t('responsibleUseSettingsAccepted', formatResponsibleUseAcceptedAt(responsibleUseAcceptedAt))}
        {:else}
          {t('responsibleUseSettingsNotAccepted')}
        {/if}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onclick={() => { responsibleUseDialogOpen = true; }}
          class="px-3 py-1.5 text-xs font-medium bg-gray-800 text-white rounded hover:bg-gray-900"
        >
          {t('responsibleUseReview')}
        </button>
        <a
          href={TERMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-blue-600 hover:underline"
        >
          {t('responsibleUseOpenTerms')}
        </a>
      </div>
    </section>

    <section class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">Mastodon</h2>
      <div class="space-y-2">
        <label for="mastodon-instance" class="block text-sm text-gray-600">
          {t('instanceUrl')}
          <span class="text-xs text-gray-400 ml-1">{t('instanceHint')}</span>
        </label>
        <input
          id="mastodon-instance"
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
        <label for="misskey-instance" class="block text-sm text-gray-600">
          {t('instanceUrl')}
          <span class="text-xs text-gray-400 ml-1">{t('instanceHint')}</span>
        </label>
        <input
          id="misskey-instance"
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

      {#each API_CREDENTIAL_PROVIDERS as provider, index (provider.id)}
        {@const editor = credentialEditors[provider.id]}
        <ApiCredentialEditor
          {provider}
          primary={editor.primary}
          secret={editor.secret}
          busy={editor.busy}
          status={editor.status}
          last={index === API_CREDENTIAL_PROVIDERS.length - 1}
          onPrimaryChange={(value) => { editor.primary = value; }}
          onSecretChange={(value) => { editor.secret = value; }}
          onSave={() => { void handleCredentialSave(provider); }}
          onClear={() => { void handleCredentialClear(provider); }}
        />
      {/each}
    </section>

    <section class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">{t('selectorUpdateTitle')}</h2>
      <div class="space-y-2">
        <label for="selector-override-url" class="block text-sm text-gray-600">{t('selectorUpdateUrl')}</label>
        <input
          id="selector-override-url"
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
        <label for="log-level" class="block text-sm text-gray-600">{t('logLevelLabel')}</label>
        <select
          id="log-level"
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
        <label for="pixiv-visibility" class="block text-sm text-gray-600">{t('pixivVisibilityLabel')}</label>
        <select id="pixiv-visibility" bind:value={pixivVisibility} class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="general">general — {t('pixivVisibilityGeneralDesc')}</option>
          <option value="r18">R-18 — {t('pixivVisibilityR18Desc')}</option>
          <option value="r18g">R-18G — {t('pixivVisibilityR18gDesc')}</option>
        </select>
        <label for="pixiv-ai-type" class="block text-sm text-gray-600 pt-2">{t('pixivAiTypeLabel')}</label>
        <select id="pixiv-ai-type" bind:value={pixivAiType} class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
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
          <input type="checkbox" bind:checked={notifyInteractions} class="rounded" />
          <span>{t('notifyInteractionsLabel')}</span>
        </label>
        <p class="text-xs text-gray-400">{t('notifyInteractionsHint')}</p>
        <div class="pt-3 border-t border-gray-100 mt-2">
          <button
            type="button"
            onclick={handleClearHistory}
            class="px-3 py-1.5 text-xs font-medium border border-red-300 text-red-700 rounded hover:bg-red-50"
          >{historyCleared ? t('historyClearedConfirmation') : t('clearAll')}</button>
          <p class="text-xs text-gray-400 mt-1">{t('historyClearAllHint')}</p>
        </div>
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
        <label for="auto-open-post-url" class="block text-sm text-gray-600">{t('autoOpenLabel')}</label>
        <select
          id="auto-open-post-url"
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

{#if responsibleUseDialogOpen}
  <ResponsibleUseDialog
    mode="review"
    onAccept={acceptResponsibleUse}
    onDismiss={() => { responsibleUseDialogOpen = false; }}
  />
{/if}
