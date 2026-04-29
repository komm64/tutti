<script lang="ts">
  import { getSettings, saveSettings } from '../../src/storage';

  let mastodonInstance = $state('https://mastodon.social');
  let misskeyInstance = $state('https://misskey.io');
  let saved = $state(false);
  let loading = $state(true);
  const version = browser.runtime.getManifest().version;

  $effect(() => {
    void getSettings().then((s) => {
      mastodonInstance = s.mastodonInstance;
      misskeyInstance = s.misskeyInstance;
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
      alert('https:// から始まる URL を入力してください');
      return;
    }
    if (!(await ensurePermission(m, 'https://mastodon.social'))) {
      alert('Mastodon インスタンスへのアクセス権限が拒否されました。');
      return;
    }
    if (!(await ensurePermission(k, 'https://misskey.io'))) {
      alert('Misskey インスタンスへのアクセス権限が拒否されました。');
      return;
    }
    await saveSettings({ mastodonInstance: m, misskeyInstance: k });
    mastodonInstance = m;
    misskeyInstance = k;
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }
</script>

<div class="max-w-lg mx-auto p-6 text-gray-900">
  <h1 class="text-xl font-bold mb-1">
    Tutti 設定
    <span class="text-sm font-normal text-gray-400 ml-1">v{version}</span>
  </h1>
  <p class="text-sm text-gray-500 mb-6">クロスポスト拡張の設定</p>

  {#if loading}
    <p class="text-sm text-gray-400">読み込み中...</p>
  {:else}
    <section class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">Mastodon</h2>
      <div class="space-y-2">
        <label class="block text-sm text-gray-600">
          インスタンス URL
          <span class="text-xs text-gray-400 ml-1">(末尾スラッシュなし)</span>
        </label>
        <input
          type="url"
          bind:value={mastodonInstance}
          placeholder="https://mastodon.social"
          class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <p class="text-xs text-gray-400">
          mastodon.social 以外のインスタンスを使っている場合に変更してください。
          保存時にそのインスタンスへのアクセス権限を Chrome に求めます。
        </p>
      </div>
    </section>

    <section class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">Misskey</h2>
      <div class="space-y-2">
        <label class="block text-sm text-gray-600">
          インスタンス URL
          <span class="text-xs text-gray-400 ml-1">(末尾スラッシュなし)</span>
        </label>
        <input
          type="url"
          bind:value={misskeyInstance}
          placeholder="https://misskey.io"
          class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <p class="text-xs text-gray-400">
          misskey.io 以外のインスタンスを使う場合に変更してください。
        </p>
      </div>
    </section>

    <div class="flex items-center gap-3">
      <button
        onclick={handleSave}
        class="px-4 py-2 bg-blue-500 text-white rounded text-sm font-medium hover:bg-blue-600"
      >
        保存
      </button>
      {#if saved}
        <span class="text-sm text-green-600">✓ 保存しました</span>
      {/if}
    </div>
  {/if}
</div>
