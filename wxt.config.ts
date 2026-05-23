import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDescription__',
    default_locale: 'en',
    permissions: ['storage', 'offscreen', 'sidePanel'],
    host_permissions: [
      'https://x.com/*',
      'https://twitter.com/*',
      'https://bsky.app/*',
      // P15: Bluesky API path (default PDS)。custom PDS は optional で
      'https://bsky.social/*',
      'https://www.threads.net/*',
      'https://www.threads.com/*',
      'https://mastodon.social/*',
      'https://misskey.io/*',
      'https://www.tumblr.com/*',
      'https://tumblr.com/*',
      'https://www.pixiv.net/*',
      'https://pixiv.net/*',
      'https://www.deviantart.com/*',
      'https://deviantart.com/*',
      'https://www.instagram.com/*',
      'https://instagram.com/*',
      'https://www.tiktok.com/*',
      'https://tiktok.com/*',
      'https://*.youtube.com/*',
      'https://youtube.com/*',
    ],
    // Mastodon はユーザー設定のインスタンスへのアクセスを optional で要求
    optional_host_permissions: ['https://*/*'],
    // P16: ffmpeg.wasm の WebAssembly.compile に wasm-unsafe-eval が必要
    // (MV3 default CSP は wasm-unsafe-eval を許可しないため明示)
    content_security_policy: {
      // wasm-unsafe-eval: ffmpeg.wasm の WebAssembly.compile に必須。
      // worker-src は **指定しない** (= script-src を継承して 'self' のみ許可)。
      // MV3 は worker-src に blob: を許可しないので追加できない (manifest 検証で reject)。
      // ffmpeg.wasm は chrome-extension://<id>/assets/worker-*.js を Worker URL に
      // 使うので 'self' の範囲内で動作する。
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    // P16: ffmpeg-core 内部 Worker が postMessage で /ffmpeg/*.wasm を fetch するため
    // 一応 web_accessible_resources にも入れておく (offscreen origin からの直接 access
    // には不要だが、Worker context によっては別 origin 扱いされるケース対策)
    web_accessible_resources: [
      {
        resources: [
          'ffmpeg/ffmpeg-core.js',
          'ffmpeg/ffmpeg-core.wasm',
          'assets/*',
        ],
        matches: ['<all_urls>'],
      },
    ],
    action: {
      default_title: '__MSG_appName__',
    },
    // v0.5.0: side panel 対応 (Chrome 114+)。 options で displayMode='sidepanel'
    // を選ぶと、 bg が setPanelBehavior でアイコン click を sidepanel に振る。
    side_panel: {
      default_path: 'sidepanel.html',
    },
    // v0.4.89: キーボードショートカット。 `Ctrl+Shift+T` (Mac は Cmd+Shift+T) で popup を開く。
    // Chrome は global shortcut 衝突を避けるため user が chrome://extensions/shortcuts で
    // 変更可能。 default を設定するだけで強制はしない。
    commands: {
      _execute_action: {
        suggested_key: {
          default: 'Ctrl+Shift+Y',
          mac: 'Command+Shift+Y',
        },
        description: '__MSG_openPopupShortcut__',
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
