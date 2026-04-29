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
      'https://www.threads.com/*',
      'https://mastodon.social/*',
    ],
    // Mastodon はユーザー設定のインスタンスへのアクセスを optional で要求
    optional_host_permissions: ['https://*/*'],
    action: {
      default_title: 'Tutti',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
