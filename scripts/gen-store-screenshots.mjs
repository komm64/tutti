// Web Store 提出用スクショ 5 枚を生成。各シーンの popup を 1280x800 キャンバスに
// 配置 + キャッチコピー文字。Chrome Web Store の screenshot サイズは 1280x800
// または 640x400。1280 で出すと拡縮なしでクリアに見える。
//
// 個人ハンドル漏洩対策(2026-05-01):
//   - 全 SNS タブを閉じてから snap (content script の REPORT_USER で
//     lastSeenUsers が上書きされるのを防ぐ)
//   - lastSeenUsers は全 SNS で `@your.handle` 統一
//   - popup 表示直前にも storage 再セット (レース回避)
//   - LANG=ja|en で popup 内 UI 言語を切替 (browser.i18n.getMessage を monkey-patch)
//
// 使い方:
//   LANG=ja node scripts/gen-store-screenshots.mjs
//   LANG=en node scripts/gen-store-screenshots.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'node:fs';

const LANG = process.env.LANG === 'en' ? 'en' : 'ja';
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
mkdirSync('docs/screenshots', { recursive: true });

// 該当 locale の messages.json を読み込んで popup の i18n を上書き
const messagesPath = `locales/${LANG}/messages.json`;
const messages = JSON.parse(readFileSync(messagesPath, 'utf8'));

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

// SNS のタブを全部閉じる(content script で lastSeenUsers が上書きされるため)
const SNS_HOSTS = [
  'x.com', 'twitter.com', 'bsky.app',
  'threads.net', 'threads.com',
  'mastodon.social', 'misskey.io',
  'tumblr.com',
  'pixiv.net', 'deviantart.com',
  'instagram.com', 'tiktok.com', 'youtube.com', 'studio.youtube.com',
];
for (const p of await browser.pages()) {
  const url = p.url();
  if (SNS_HOSTS.some((h) => url.includes(h))) {
    console.log('[close]', url);
    await p.close().catch(() => {});
  }
  if (url.includes('popup.html')) await p.close().catch(() => {});
}

// 添付サンプル画像 (scripts/gen-attach-image.mjs で先に生成)
const tmpImg = 'docs/screenshots/attach-sample.png';

const scenes = [
  {
    name: '01-overview',
    autoPost: false,
    textJa: '',
    textEn: '',
    image: false,
    selectIdxs: new Set([0, 1, 2, 3]),
  },
  {
    name: '02-write',
    autoPost: false,
    textJa: '今夜の作業はここまで!明日は新しい曲のミックスダウンに入る予定。\n\n#composing #musicproduction',
    textEn: 'Wrapping up for tonight. Tomorrow I dive into the mixdown of the new track.\n\n#composing #musicproduction',
    image: false,
    selectIdxs: new Set([0, 1, 2, 3, 4]),
  },
  {
    name: '03-image',
    autoPost: false,
    textJa: '今日のセッション、いい感じに録れた。\n\n#studiolife',
    textEn: "Today's session came out great.\n\n#studiolife",
    image: true,
    selectIdxs: new Set([0, 1, 2, 3]),
  },
  {
    // scene 04 は autoPost ON で本当に投稿が走る (progress UI を撮るのに必要)。
    // 過去に複数 SNS (X / Bluesky / Tumblr) を選んでいて、 スクショ生成のたびに
    // dummy 垢で実投稿が複数 SNS に landing する事故を起こしていた。
    // **Bluesky 1 件に絞って blast radius を最小化**。 progress UI の visual は
    // 単発になるが、 安全性優先。
    name: '04-progress',
    autoPost: true,
    textJa: '来週末ライブやります!チケットは下のリンクから 🎵',
    textEn: 'Live show next weekend! Tickets at the link below 🎵',
    image: true,
    selectIdxs: new Set([1]),
    triggerPost: true,
    captureAfterMs: 4000,
  },
  {
    name: '05-safety',
    autoPost: false,
    textJa: '新機能リリースしました 🚀',
    textEn: 'Just shipped a new feature 🚀',
    image: false,
    selectIdxs: new Set([0, 1, 2]),
  },
];

const FAKE_USERS = {
  x: '@your.handle',
  bluesky: '@your.handle',
  threads: '@your.handle',
  mastodon: '@your.handle',
  misskey: '@your.handle',
  tumblr: '@your.handle',
  pixiv: '@your.handle',
  deviantart: '@your.handle',
  instagram: '@your.handle',
  tiktok: '@your.handle',
  youtube: '@your.handle',
};

async function setupScene(scene) {
  // Settings + storage を pre-seed
  const tmpPopup = await browser.newPage();
  await tmpPopup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await new Promise((r) => setTimeout(r, 800));
  await tmpPopup.evaluate(async (scene, fakeUsers) => {
    await new Promise((r) => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', autoPost: scene.autoPost, selectorOverrideUrl: '', logLevel: 'INFO' } }, r));
    await new Promise((r) => chrome.storage.session.remove('draft', r));
    await new Promise((r) => chrome.storage.local.remove('selectedPlatforms', r));
    await new Promise((r) => chrome.storage.local.set({ lastSeenUsers: fakeUsers }, r));
    // media draft は IndexedDB (tutti-draft / media / current) に残るので明示的に消す
    await new Promise((resolve) => {
      const req = indexedDB.open('tutti-draft', 1);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('media')) { db.close(); return resolve(); }
        const tx = db.transaction('media', 'readwrite');
        tx.objectStore('media').delete('current');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
      };
      req.onerror = () => resolve();
    });
  }, scene, FAKE_USERS);
  await tmpPopup.close();

  const popup = await browser.newPage();

  // i18n 上書き(popup script load 前に install)
  await popup.evaluateOnNewDocument((messagesArg, fakeUsers) => {
    const getMsg = (key, subs) => {
      const entry = messagesArg[key];
      if (!entry || !entry.message) return '';
      let msg = entry.message;
      if (entry.placeholders && (Array.isArray(subs) ? subs.length > 0 : subs != null)) {
        for (const [pname, pdef] of Object.entries(entry.placeholders)) {
          const m = pdef.content && pdef.content.match(/\$(\d+)/);
          if (!m) continue;
          const idx = parseInt(m[1], 10) - 1;
          const val = Array.isArray(subs) ? (subs[idx] ?? '') : (idx === 0 ? String(subs) : '');
          msg = msg.replaceAll('$' + pname + '$', String(val));
        }
      }
      return msg;
    };
    const installOverride = () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.i18n) {
          chrome.i18n.getMessage = getMsg;
        }
      } catch { /* ignore */ }
      try {
        if (typeof browser !== 'undefined' && browser && browser.i18n) {
          browser.i18n.getMessage = getMsg;
        }
      } catch { /* ignore */ }
    };
    installOverride();
    // browser が後から define される polyfill ケースに備えてフックする
    let _browser = (typeof browser !== 'undefined') ? browser : undefined;
    try {
      Object.defineProperty(globalThis, 'browser', {
        get() { return _browser; },
        set(v) {
          _browser = v;
          installOverride();
        },
        configurable: true,
      });
    } catch { /* already non-configurable */ }
    // 念のため lastSeenUsers も上書き(popup 起動と同時に reset)
    try {
      if (chrome?.storage?.local?.set) {
        chrome.storage.local.set({ lastSeenUsers: fakeUsers });
      }
    } catch { /* ignore */ }
  }, messages, FAKE_USERS);

  await popup.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await new Promise((r) => setTimeout(r, 1500));

  // text 注入(locale 別)
  const sceneText = LANG === 'en' ? scene.textEn : scene.textJa;
  if (sceneText) {
    await popup.evaluate(() => { document.querySelector('textarea').focus(); });
    await popup.type('textarea', sceneText);
  }

  if (scene.image) {
    const fi = await popup.$('input[type="file"]');
    await fi.uploadFile(tmpImg);
    await new Promise((r) => setTimeout(r, 800));
  }

  // SNS 選択
  await popup.evaluate((idxs) => {
    const cbs = Array.from(document.querySelectorAll('input[type="checkbox"][class*="accent-blue"]'));
    const platformCbs = cbs.slice(1);
    platformCbs.forEach((cb, i) => { const want = idxs.includes(i); if (cb.checked !== want) cb.click(); });
  }, [...scene.selectIdxs]);
  await new Promise((r) => setTimeout(r, 400));

  // スクショ直前に lastSeenUsers を再セット(content script からの REPORT_USER で
  // 上書きされても勝てるように)
  await popup.evaluate((fakeUsers) => new Promise((r) => chrome.storage.local.set({ lastSeenUsers: fakeUsers }, r)), FAKE_USERS);
  await new Promise((r) => setTimeout(r, 300));

  if (scene.triggerPost) {
    await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find((b) => /SNS に投稿|プレビュー|Preview|Post to/.test(b.textContent ?? ''))?.click());
    await new Promise((r) => setTimeout(r, scene.captureAfterMs ?? 3000));
  }

  return popup;
}

for (const scene of scenes) {
  console.log(`\n[scene ${LANG}] ${scene.name}`);
  const popup = await setupScene(scene);
  const main = await popup.$('main');
  if (!main) throw new Error('no <main> in popup');
  const out = `docs/screenshots/${scene.name}-popup-${LANG}.png`;
  await main.screenshot({ path: out });
  console.log('wrote', out);
  await popup.close();
}

await browser.disconnect();
console.log('\ndone. Run gen-store-composite.mjs (LANG=' + LANG + ') to make 1280x800 banners.');
