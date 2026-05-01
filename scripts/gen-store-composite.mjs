// Web Store 提出用スクショ 5 枚 (1280x800) を本気デザインで合成。
// 各シーン: 左に大きい headline + subtitle + SNS chip 行、右に popup card。
// puppeteer で HTML をレンダ → screenshot。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

const scenes = [
  {
    name: '01-overview',
    eyebrow: 'CROSS-POSTING, ONE BUTTON',
    title: 'クロスポストの面倒を、\nまるごと肩代わり',
    subtitle: 'X / Bluesky / Threads / Tumblr / Mastodon / Misskey に\n同じ投稿を一発で。各 SNS の制約は Tutti が処理します。',
    palette: { from: '#0d9488', to: '#0f766e', ink: '#ffffff', sub: 'rgba(255,255,255,0.85)' },
  },
  {
    name: '02-write',
    eyebrow: 'WRITE ONCE',
    title: '書いて、選んで、\nボタンを押すだけ',
    subtitle: '文字数オーバーは自動分割。各 SNS の上限 (X 280 / Bluesky 300 /\nThreads 500 ...) を Tutti が自動で吸収します。',
    palette: { from: '#1e40af', to: '#1e3a8a', ink: '#ffffff', sub: 'rgba(255,255,255,0.82)' },
  },
  {
    name: '03-image',
    eyebrow: 'MEDIA HANDLED',
    title: '画像も自動でリサイズ',
    subtitle: 'Bluesky の 1MB 制限など各 SNS のサイズ上限に合わせて Canvas で\n自動リサイズ。drag & drop で 4 枚まで添付できます。',
    palette: { from: '#7c3aed', to: '#5b21b6', ink: '#ffffff', sub: 'rgba(255,255,255,0.85)' },
  },
  {
    name: '04-progress',
    eyebrow: 'LIVE PROGRESS',
    title: '投稿中も状況がわかる',
    subtitle: '各 SNS の状態 (進行中 / 完了 / 失敗) が SNS 行に統合表示。\n失敗したらその場で原因が見えるので、リトライ判断もすぐ。',
    palette: { from: '#0e7490', to: '#155e75', ink: '#ffffff', sub: 'rgba(255,255,255,0.85)' },
  },
  {
    name: '05-safety',
    eyebrow: 'SAFE BY DEFAULT',
    title: '初回はプレビューモードで安心',
    subtitle: '送信前に各 SNS の compose を開いて確認。投稿ボタンは押しません。\n誤投稿の事故を防ぐ Tutti のデフォルト動作です。',
    palette: { from: '#b45309', to: '#92400e', ink: '#ffffff', sub: 'rgba(255,255,255,0.88)' },
  },
];

// ロゴ T(SVG)— Tutti のアイコンと同じシルエット
const LOGO_SVG = `<svg viewBox="0 0 64 64" width="36" height="36" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" rx="14" fill="white" />
  <path d="M16 18 H48 V26 H37 V50 H27 V26 H16 Z" fill="#0d9488" />
</svg>`;

// SNS chip 行(brand-color の小さいタグ)
const SNS_CHIPS = `
  <span class="chip" style="background:#000;color:white;">X</span>
  <span class="chip" style="background:#0085ff;color:white;">Bluesky</span>
  <span class="chip" style="background:#101010;color:white;">Threads</span>
  <span class="chip" style="background:#001935;color:white;">Tumblr</span>
  <span class="chip" style="background:#6364ff;color:white;">Mastodon</span>
  <span class="chip" style="background:#86b300;color:white;">Misskey</span>
`;

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

for (const scene of scenes) {
  const popupPng = readFileSync(`docs/screenshots/${scene.name}-popup.png`);
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
    display: grid; grid-template-columns: 1fr 540px; gap: 56px;
    padding: 70px 80px 70px 80px;
    align-items: center;
  }
  /* 左: text column */
  .left { color: ${scene.palette.ink}; min-width: 0; }
  .brand-row { display: flex; align-items: center; gap: 14px; margin-bottom: 36px; }
  .brand-row .name { font-weight: 800; font-size: 24px; letter-spacing: -0.01em; }
  .brand-row .tagline { font-size: 13px; color: ${scene.palette.sub}; padding-left: 14px; border-left: 1px solid rgba(255,255,255,0.3); }
  .eyebrow {
    display: inline-block; font-size: 12px; font-weight: 800; letter-spacing: 0.18em;
    color: ${scene.palette.sub}; margin-bottom: 18px;
    padding: 6px 12px; background: rgba(255,255,255,0.14); border-radius: 999px;
  }
  h1 {
    font-size: 60px; font-weight: 900; line-height: 1.18;
    letter-spacing: -0.025em; margin-bottom: 22px; white-space: pre-line;
  }
  .sub { font-size: 20px; line-height: 1.6; color: ${scene.palette.sub}; max-width: 540px; white-space: pre-line; }
  /* SNS chip row */
  .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 32px; }
  .chip { font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 999px; letter-spacing: 0.02em; }
  /* 右: popup card */
  .right { display: flex; align-items: center; justify-content: center; }
  .card {
    width: 460px;
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
    position: absolute; bottom: 26px; left: 80px;
    display: flex; align-items: center; gap: 10px;
    font-size: 12px; color: rgba(255,255,255,0.55); letter-spacing: 0.05em;
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
      <div class="tagline">クロスポスト Chrome 拡張</div>
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
    <span>クロスポストの面倒を全部肩代わり</span>
  </div>
</body></html>
  `;
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));
  const out = `docs/screenshots/${scene.name}-1280x800.png`;
  await page.screenshot({ path: out });
  console.log('wrote', out);
}

await browser.disconnect();
