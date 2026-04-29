import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDescription__',
    default_locale: 'en',
    permissions: ['storage', 'offscreen'],
    host_permissions: [
      'https://x.com/*',
      'https://twitter.com/*',
      'https://bsky.app/*',
      'https://www.threads.net/*',
      'https://www.threads.com/*',
      'https://mastodon.social/*',
      'https://misskey.io/*',
    ],
    // Mastodon はユーザー設定のインスタンスへのアクセスを optional で要求
    optional_host_permissions: ['https://*/*'],
    action: {
      default_title: '__MSG_appName__',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
