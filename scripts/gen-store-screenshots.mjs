// Web Store 提出用スクショ 5 枚を生成。各シーンの popup を 1280x800 キャンバスに
// 配置 + キャッチコピー文字。Chrome Web Store の screenshot サイズは 1280x800
// または 640x400。1280 で出すと拡縮なしでクリアに見える。
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
mkdirSync('docs/screenshots', { recursive: true });

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

// Each scene: setup function + caption
const tmpImg = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png';

const scenes = [
  {
    name: '01-overview',
    title: 'クロスポスト、ボタン 1 つで',
    subtitle: 'X / Bluesky / Threads / Tumblr / Mastodon / Misskey に同時投稿',
    autoPost: false,
    text: '',
    image: false,
    selectIdxs: new Set([0, 1, 2, 3]),
  },
  {
    name: '02-write',
    title: '書いて、選んで、押すだけ',
    subtitle: '文字数オーバーは自動分割。各 SNS の制約を Tutti が処理',
    autoPost: false,
    text: '今夜の作業はここまで!明日は新しい曲のミックスダウンに入る予定。\n\n#composing #musicproduction',
    image: false,
    selectIdxs: new Set([0, 1, 2, 3, 4]),
  },
  {
    name: '03-image',
    title: '画像も自動でリサイズ',
    subtitle: 'Bluesky の 1MB 制限など各 SNS の上限に合わせて自動調整',
    autoPost: false,
    text: '今日のセッション、いい感じに録れた。\n\n#studiolife',
    image: true,
    selectIdxs: new Set([0, 1, 2, 3]),
  },
  {
    name: '04-progress',
    title: '投稿中もちゃんと見える',
    subtitle: '各 SNS のステータスが一目で分かる進捗 UI',
    autoPost: true,
    text: 'Live show next weekend! Tickets at the link below 🎵',
    image: true,
    selectIdxs: new Set([0, 1, 3]),
    triggerPost: true,
    captureAfterMs: 4000,
  },
  {
    name: '05-safety',
    title: '初回はプレビューモード',
    subtitle: '送信前に各 SNS の compose 画面で確認できる',
    autoPost: false,
    text: 'Just shipped a new feature 🚀',
    image: false,
    selectIdxs: new Set([0, 1, 2]),
  },
];

async function setupScene(scene) {
  // Close existing popup
  for (const p of await browser.pages()) {
    if (p.url().includes('popup.html')) await p.close();
  }
  // Set settings + clear state
  const tmpPopup = await browser.newPage();
  await tmpPopup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await new Promise(r => setTimeout(r, 800));
  await tmpPopup.evaluate((scene) => Promise.all([
    new Promise(r => chrome.storage.sync.set({ settings: { mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', autoPost: scene.autoPost, selectorOverrideUrl: '' } }, r)),
    new Promise(r => chrome.storage.session.remove('draft', r)),
    // Reset selection per scene by NOT setting selectedPlatforms, then setting via UI later
    new Promise(r => chrome.storage.local.remove('selectedPlatforms', r)),
    // Pre-populate lastSeenUsers so accounts show for marketing screenshot
    new Promise(r => chrome.storage.local.set({ lastSeenUsers: {
      x: '@your_handle',
      bluesky: '@you.bsky.social',
      threads: '@your.handle',
      mastodon: '@you',
      misskey: '@you',
      tumblr: '@your-blog',
    } }, r)),
  ]), scene);
  await tmpPopup.close();

  const popup = await browser.newPage();
  await popup.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await new Promise(r => setTimeout(r, 1500));
  if (scene.text) {
    await popup.evaluate((t) => { document.querySelector('textarea').focus(); }, null);
    await popup.type('textarea', scene.text);
  }
  if (scene.image) {
    const fi = await popup.$('input[type="file"]');
    await fi.uploadFile(tmpImg);
    await new Promise(r => setTimeout(r, 800));
  }
  // Set selection
  await popup.evaluate((idxs) => {
    const cbs = Array.from(document.querySelectorAll('input[type="checkbox"][class*="accent-blue"]'));
    const platformCbs = cbs.slice(1);
    platformCbs.forEach((cb, i) => { const want = idxs.includes(i); if (cb.checked !== want) cb.click(); });
  }, [...scene.selectIdxs]);
  await new Promise(r => setTimeout(r, 400));
  if (scene.triggerPost) {
    await popup.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /SNS に投稿|プレビュー|Preview|Post to/.test(b.textContent ?? ''))?.click());
    await new Promise(r => setTimeout(r, scene.captureAfterMs ?? 3000));
  }
  return popup;
}

for (const scene of scenes) {
  console.log(`\n[scene] ${scene.name}: ${scene.title}`);
  const popup = await setupScene(scene);
  // Crop to the popup <main> element so the screenshot is exactly the popup
  // content height (no trailing white from the surrounding viewport).
  const main = await popup.$('main');
  if (!main) throw new Error('no <main> in popup');
  await main.screenshot({ path: `docs/screenshots/${scene.name}-popup.png` });
  await popup.close();
}

await browser.disconnect();
console.log('\ndone. Now run gen-store-composite.mjs to make 1280x800 banners.');
