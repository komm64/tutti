// Web Store 提出用スクショ 5 枚 (1280x800) を本気デザインで合成。
// 各シーン: 左に大きい headline + subtitle + SNS chip 行、右に popup card。
// puppeteer で HTML をレンダ → screenshot。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

/**
 * `LANG=en node scripts/gen-store-composite.mjs` で英語版を生成。
 * 既定は日本語(env LANG が 'en' でないとき)。
 */
const LANG = process.env.LANG === 'en' ? 'en' : 'ja';
const OUT_SUFFIX = LANG === 'en' ? '-en' : '';

const SCENES_JA = [
  {
    name: '01-overview',
    eyebrow: 'CROSS-POSTING, ONE BUTTON',
    title: 'クロスポストの面倒を、\nまるごと肩代わり',
    subtitle: '対応する各 SNS に同じ投稿を一発で。\n各 SNS の制約は Tutti が処理します。',
    tagline: 'クロスポスト Chrome 拡張',
    footer: 'クロスポストの面倒を全部肩代わり',
    palette: { from: '#0d9488', to: '#0f766e', ink: '#ffffff', sub: 'rgba(255,255,255,0.85)' },
  },
  {
    name: '02-write',
    eyebrow: 'WRITE ONCE',
    title: '書いて、選んで、\nボタンを押すだけ',
    subtitle: '各 SNS の文字数上限を超えた長文は\n自動でスレッド分割して連投します。',
    tagline: 'クロスポスト Chrome 拡張',
    footer: 'クロスポストの面倒を全部肩代わり',
    palette: { from: '#1e40af', to: '#1e3a8a', ink: '#ffffff', sub: 'rgba(255,255,255,0.82)' },
  },
  {
    name: '03-image',
    eyebrow: 'MEDIA HANDLED',
    title: '画像も自動でリサイズ',
    subtitle: '各 SNS の画像サイズ制限に合わせて\nCanvas で自動リサイズ。最大 4 枚まで添付。',
    tagline: 'クロスポスト Chrome 拡張',
    footer: 'クロスポストの面倒を全部肩代わり',
    palette: { from: '#7c3aed', to: '#5b21b6', ink: '#ffffff', sub: 'rgba(255,255,255,0.85)' },
  },
  {
    name: '04-progress',
    eyebrow: 'LIVE PROGRESS',
    title: '投稿中の状況も\n一目でわかる',
    subtitle: '各 SNS の状態 (進行中 / 完了 / 失敗) が SNS 行に統合表示。\n失敗時は原因がその場で見えます。',
    tagline: 'クロスポスト Chrome 拡張',
    footer: 'クロスポストの面倒を全部肩代わり',
    palette: { from: '#0e7490', to: '#155e75', ink: '#ffffff', sub: 'rgba(255,255,255,0.85)' },
  },
  {
    name: '05-safety',
    eyebrow: 'SAFE BY DEFAULT',
    title: '初回はプレビュー\nモードで安心',
    subtitle: '送信前に各 SNS の compose を開いて確認。\nPost ボタンは押しません。慣れたら自動投稿に切替。',
    tagline: 'クロスポスト Chrome 拡張',
    footer: 'クロスポストの面倒を全部肩代わり',
    palette: { from: '#b45309', to: '#92400e', ink: '#ffffff', sub: 'rgba(255,255,255,0.88)' },
  },
];

const SCENES_EN = [
  {
    name: '01-overview',
    eyebrow: 'CROSS-POSTING, ONE BUTTON',
    title: 'All cross-posting\nhassle, handled.',
    subtitle: 'Send the same post to all your networks in one click.\nEach network’s constraints are handled for you.',
    tagline: 'Cross-post Chrome extension',
    footer: 'All cross-posting hassle, handled.',
    palette: { from: '#0d9488', to: '#0f766e', ink: '#ffffff', sub: 'rgba(255,255,255,0.85)' },
  },
  {
    name: '02-write',
    eyebrow: 'WRITE ONCE',
    title: 'Write once,\npick networks, post.',
    subtitle: 'Long posts that exceed a network’s character limit\nare automatically split into a continuation thread.',
    tagline: 'Cross-post Chrome extension',
    footer: 'All cross-posting hassle, handled.',
    palette: { from: '#1e40af', to: '#1e3a8a', ink: '#ffffff', sub: 'rgba(255,255,255,0.82)' },
  },
  {
    name: '03-image',
    eyebrow: 'MEDIA HANDLED',
    title: 'Images, automatically\nresized.',
    subtitle: 'Canvas-based auto-resize fits each network’s\nimage size limit. Up to 4 images per post.',
    tagline: 'Cross-post Chrome extension',
    footer: 'All cross-posting hassle, handled.',
    palette: { from: '#7c3aed', to: '#5b21b6', ink: '#ffffff', sub: 'rgba(255,255,255,0.85)' },
  },
  {
    name: '04-progress',
    eyebrow: 'LIVE PROGRESS',
    title: 'See what’s posting,\nlive.',
    subtitle: 'Per-network status (in flight / done / failed) is shown\ninline on each network row, with cause on failure.',
    tagline: 'Cross-post Chrome extension',
    footer: 'All cross-posting hassle, handled.',
    palette: { from: '#0e7490', to: '#155e75', ink: '#ffffff', sub: 'rgba(255,255,255,0.85)' },
  },
  {
    name: '05-safety',
    eyebrow: 'SAFE BY DEFAULT',
    title: 'Preview-first,\nby default.',
    subtitle: 'Tutti opens each network’s compose for review\nand stops just before the Post button.',
    tagline: 'Cross-post Chrome extension',
    footer: 'All cross-posting hassle, handled.',
    palette: { from: '#b45309', to: '#92400e', ink: '#ffffff', sub: 'rgba(255,255,255,0.88)' },
  },
];

const scenes = LANG === 'en' ? SCENES_EN : SCENES_JA;

// ロゴ T(SVG)— Tutti のアイコンと同じシルエット
const LOGO_SVG = `<svg viewBox="0 0 64 64" width="36" height="36" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" rx="14" fill="white" />
  <path d="M16 18 H48 V26 H37 V50 H27 V26 H16 Z" fill="#0d9488" />
</svg>`;

// SNS chip 行(brand-color の小さいタグ)。表示順は popup と揃える。
const SNS_CHIPS = `
  <span class="chip" style="background:#000;color:white;">X</span>
  <span class="chip" style="background:#0085ff;color:white;">Bluesky</span>
  <span class="chip" style="background:#101010;color:white;">Threads</span>
  <span class="chip" style="background:#001935;color:white;">Tumblr</span>
  <span class="chip" style="background:#6364ff;color:white;">Mastodon</span>
  <span class="chip" style="background:#86b300;color:white;">Misskey</span>
  <span class="chip" style="background:#0096fa;color:white;">Pixiv</span>
  <span class="chip" style="background:#00e59b;color:#0b1a16;">DeviantArt</span>
  <span class="chip" style="background:#e1306c;color:white;">Instagram</span>
  <span class="chip" style="background:#010101;color:#25f4ee;">TikTok</span>
  <span class="chip" style="background:#ff0000;color:white;">YouTube</span>
`;

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

for (const scene of scenes) {
  // popup スクショは locale 別に生成済み (gen-store-screenshots.mjs LANG=ja|en)
  const popupPng = readFileSync(`docs/screenshots/${scene.name}-popup-${LANG}.png`);
  const popupB64 = popupPng.toString('base64');
  const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
  html, body { width: 1280px; height: 800px; font-family: "Hiragino Sans", "Yu Gothic UI", "Meiryo", -apple-system, sans-serif; overflow: hidden; }
  body {
    position: relative;
    background:
      radial-gradient(circle at 85% 15%, rgba(255,255,255,0.18), transparent 55%),
      radial-gradient(circle at 15% 85%, rgba(0,0,0,0.18), transparent 55%),
      linear-gradient(135deg, ${scene.palette.from} 0%, ${scene.palette.to} 100%);
    display: grid; grid-template-columns: 1fr 440px; gap: 48px;
    padding: 60px 64px 80px 64px;
    align-items: center;
  }
  /* 左: text column */
  .left { color: ${scene.palette.ink}; min-width: 0; max-width: 620px; }
  .brand-row { display: flex; align-items: center; gap: 14px; margin-bottom: 32px; }
  .brand-row .name { font-weight: 800; font-size: 22px; letter-spacing: -0.01em; }
  .brand-row .tagline { font-size: 12px; color: ${scene.palette.sub}; padding-left: 14px; border-left: 1px solid rgba(255,255,255,0.3); }
  .eyebrow {
    display: inline-block; font-size: 11px; font-weight: 800; letter-spacing: 0.18em;
    color: ${scene.palette.sub}; margin-bottom: 16px;
    padding: 5px 11px; background: rgba(255,255,255,0.14); border-radius: 999px;
  }
  h1 {
    font-size: 50px; font-weight: 900; line-height: 1.15;
    letter-spacing: -0.025em; margin-bottom: 20px; white-space: pre-line;
  }
  .sub { font-size: 17px; line-height: 1.55; color: ${scene.palette.sub}; max-width: 580px; white-space: pre-line; }
  /* SNS chip row — 11 chip 入る max-width 確保 (popup card と被らない) */
  .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 28px; max-width: 620px; }
  .chip { font-size: 10px; font-weight: 700; padding: 4px 9px; border-radius: 999px; letter-spacing: 0.02em; }
  /* 右: popup card */
  .right { display: flex; align-items: center; justify-content: center; }
  .card {
    width: 420px;
    background: white; border-radius: 14px;
    box-shadow:
      0 40px 70px -20px rgba(0,0,0,0.4),
      0 8px 24px rgba(0,0,0,0.18),
      0 0 0 1px rgba(0,0,0,0.04);
    overflow: hidden; transform: translateY(-2px);
  }
  .card img { width: 100%; height: auto; display: block; }
  /* footer */
  .footer {
    position: absolute; bottom: 24px; left: 64px;
    display: flex; align-items: center; gap: 10px;
    font-size: 11px; color: rgba(255,255,255,0.55); letter-spacing: 0.05em;
  }
  .footer .dot { width: 4px; height: 4px; border-radius: 50%; background: currentColor; opacity: 0.5; }
  /* 大きい背景の T (decorative) */
  .ghost-t {
    position: absolute; right: -120px; bottom: -180px;
    font-size: 580px; font-weight: 900; color: rgba(255,255,255,0.05);
    line-height: 1; pointer-events: none; user-select: none;
  }
</style></head>
<body>
  <div class="ghost-t">T</div>
  <div class="left">
    <div class="brand-row">
      ${LOGO_SVG}
      <div class="name">Tutti</div>
      <div class="tagline">${scene.tagline}</div>
    </div>
    <div class="eyebrow">${scene.eyebrow}</div>
    <h1>${scene.title}</h1>
    <p class="sub">${scene.subtitle}</p>
    <div class="chips">${SNS_CHIPS}</div>
  </div>
  <div class="right">
    <div class="card">
      <img src="data:image/png;base64,${popupB64}" alt="popup preview" />
    </div>
  </div>
  <div class="footer">
    <span>tutti</span><span class="dot"></span>
    <span>${scene.footer}</span>
  </div>
</body></html>
  `;
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));
  const out = `docs/screenshots/${scene.name}${OUT_SUFFIX}-1280x800.png`;
  await page.screenshot({ path: out });
  console.log('wrote', out);
}

await browser.disconnect();
