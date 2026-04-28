import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Tutti',
    description: 'クロスポストの面倒を全部肩代わりする Chrome 拡張',
    permissions: ['storage', 'offscreen'],
    host_permissions: [
      'https://x.com/*',
      'https://twitter.com/*',
      'https://bsky.app/*',
      'https://www.threads.net/*',
      // Mastodon は federated のため v1 ではデフォルトの mastodon.social のみ。
      // ユーザーごとのインスタンス切替は P8 で optional_host_permissions 化予定
      'https://mastodon.social/*',
    ],
    action: {
      default_title: 'Tutti',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
