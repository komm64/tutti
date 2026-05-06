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
  const t = (key: string) => browser.i18n.getMessage(key) || key;

  $effect(() => {
    void Promise.all([getSettings(), getFetchedAt(), getOverrides(), getApiCredentials()]).then(([s, at, ov, creds]) => {
      mastodonInstance = s.mastodonInstance;
      misskeyInstance = s.misskeyInstance;
      selectorOverrideUrl = s.selectorOverrideUrl;
      logLevel = s.logLevel;
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

  // ── API 連携 handlers ──────────────────────────────────────────
  // 「テスト & 保存」ボタン: 認証確認 → 通れば保存。失敗時は保存しない (= 既存
  // creds は壊さない)。「解除」ボタンで個別 platform の credentials を削除。
  async function handleBskySave() {
    if (!bskyId.trim() || !bskyPw.trim()) {
      bskyStatus = { ok: false, msg: 'Identifier と App Password 両方必要' };
      return;
    }
    bskyBusy = true;
    bskyStatus = { msg: 'テスト中...' };
    const result = await testBluesky({ identifier: bskyId.trim(), appPassword: bskyPw.trim() });
    if (result.ok) {
      await setApiCredentials({ bluesky: { identifier: bskyId.trim(), appPassword: bskyPw.trim() } });
      bskyStatus = { ok: true, msg: `✓ 接続成功 (${result.identifier})、保存しました` };
    } else {
      bskyStatus = { ok: false, msg: `✗ ${result.error ?? '接続失敗'}` };
    }
    bskyBusy = false;
  }
  async function handleBskyClear() {
    await clearApiCredentials('bluesky');
    bskyId = ''; bskyPw = '';
    bskyStatus = { ok: true, msg: '✓ 解除しました (DOM path に戻ります)' };
  }

  async function handleMstdSave() {
    const inst = normalizeUrl(mstdInstance);
    if (!inst || !mstdToken.trim()) {
      mstdStatus = { ok: false, msg: 'インスタンス URL と access token 両方必要' };
      return;
    }
    if (!(await ensurePermission(inst, 'https://mastodon.social'))) {
      mstdStatus = { ok: false, msg: '✗ host permission が拒否されました' };
      return;
    }
    mstdBusy = true;
    mstdStatus = { msg: 'テスト中...' };
    const result = await testMastodon({ instance: inst, accessToken: mstdToken.trim() });
    if (result.ok) {
      await setApiCredentials({ mastodon: { instance: inst, accessToken: mstdToken.trim() } });
      mstdStatus = { ok: true, msg: `✓ 接続成功 (@${result.identifier})、保存しました` };
    } else {
      mstdStatus = { ok: false, msg: `✗ ${result.error ?? '接続失敗'}` };
    }
    mstdBusy = false;
  }
  async function handleMstdClear() {
    await clearApiCredentials('mastodon');
    mstdToken = '';
    mstdStatus = { ok: true, msg: '✓ 解除しました (DOM path に戻ります)' };
  }

  async function handleMskySave() {
    const inst = normalizeUrl(mskyInstance);
    if (!inst || !mskyToken.trim()) {
      mskyStatus = { ok: false, msg: 'インスタンス URL と access token 両方必要' };
      return;
    }
    if (!(await ensurePermission(inst, 'https://misskey.io'))) {
      mskyStatus = { ok: false, msg: '✗ host permission が拒否されました' };
      return;
    }
    mskyBusy = true;
    mskyStatus = { msg: 'テスト中...' };
    const result = await testMisskey({ instance: inst, accessToken: mskyToken.trim() });
    if (result.ok) {
      await setApiCredentials({ misskey: { instance: inst, accessToken: mskyToken.trim() } });
      mskyStatus = { ok: true, msg: `✓ 接続成功 (${result.identifier})、保存しました` };
    } else {
      mskyStatus = { ok: false, msg: `✗ ${result.error ?? '接続失敗'}` };
    }
    mskyBusy = false;
  }
  async function handleMskyClear() {
    await clearApiCredentials('misskey');
    mskyToken = '';
    mskyStatus = { ok: true, msg: '✓ 解除しました (DOM path に戻ります)' };
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

    <!-- ── API 連携 (上級者向け、Phase 1: Bluesky / Mastodon / Misskey) ── -->
    <section class="mb-6 border border-amber-200 bg-amber-50/40 rounded p-4">
      <h2 class="text-sm font-semibold text-gray-800 mb-1">API 連携 <span class="text-xs text-amber-700">(上級者向け)</span></h2>
      <p class="text-xs text-gray-500 mb-4 leading-relaxed">
        鍵を設定すると <b>SNS タブを開かず API 直送</b>になります (高速 / 安定 / selector breakage 無関係)。
        鍵は拡張ローカルにのみ保存され、Tutti サーバには送信されません。
        鍵未設定の SNS は従来通りタブを開いて投稿します。
      </p>

      <!-- Bluesky -->
      <div class="space-y-2 mb-5 pb-4 border-b border-gray-200">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium">Bluesky</h3>
          <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noopener"
             class="text-xs text-blue-600 hover:underline">App Password を作成 ↗</a>
        </div>
        <input type="text" bind:value={bskyId} placeholder="user.bsky.social"
          class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <input type="password" bind:value={bskyPw} placeholder="xxxx-xxxx-xxxx-xxxx (App Password)"
          class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <div class="flex items-center gap-2">
          <button onclick={handleBskySave} disabled={bskyBusy}
            class="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-gray-300">テスト & 保存</button>
          <button onclick={handleBskyClear}
            class="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs hover:bg-gray-50">解除</button>
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
             class="text-xs text-blue-600 hover:underline">アプリを作成 ↗</a>
        </div>
        <input type="url" bind:value={mstdInstance} placeholder="https://mastodon.social"
          class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <input type="password" bind:value={mstdToken} placeholder="access token (write:statuses + write:media)"
          class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <div class="flex items-center gap-2">
          <button onclick={handleMstdSave} disabled={mstdBusy}
            class="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-gray-300">テスト & 保存</button>
          <button onclick={handleMstdClear}
            class="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs hover:bg-gray-50">解除</button>
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
             class="text-xs text-blue-600 hover:underline">トークンを発行 ↗</a>
        </div>
        <input type="url" bind:value={mskyInstance} placeholder="https://misskey.io"
          class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <input type="password" bind:value={mskyToken} placeholder="access token (write:notes + write:drive)"
          class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <div class="flex items-center gap-2">
          <button onclick={handleMskySave} disabled={mskyBusy}
            class="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-gray-300">テスト & 保存</button>
          <button onclick={handleMskyClear}
            class="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs hover:bg-gray-50">解除</button>
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
