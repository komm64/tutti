// 5 シーンの popup PNG を 1280x800 のストアスクショに合成。
// puppeteer で HTML をレンダ → screenshot。
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

const scenes = [
  { name: '01-overview', title: 'クロスポストはボタン 1 つで', subtitle: 'X / Bluesky / Threads / Tumblr / Mastodon / Misskey に同時投稿', accent: '#0d9488' },
  { name: '02-write', title: '書いて、選んで、押すだけ', subtitle: '文字数オーバーは自動分割。各 SNS の制約を Tutti が処理', accent: '#0891b2' },
  { name: '03-image', title: '画像も自動でリサイズ', subtitle: 'Bluesky 1MB など各 SNS の上限に合わせて Canvas リサイズ', accent: '#7c3aed' },
  { name: '04-progress', title: '投稿中も状態が一目で見える', subtitle: '各 SNS の進捗が SNS 行に統合表示。失敗時はその場で原因表示', accent: '#2563eb' },
  { name: '05-safety', title: '初回はプレビューモードで安心', subtitle: '送信前に各 SNS の compose を開いて確認。誤投稿事故を防ぐ', accent: '#d97706' },
];

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

for (const scene of scenes) {
  const popupPng = readFileSync(`docs/screenshots/${scene.name}-popup.png`);
  const popupB64 = popupPng.toString('base64');
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1280px; height: 800px; font-family: -apple-system, "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif; overflow: hidden; }
  body {
    background: linear-gradient(135deg, ${scene.accent} 0%, ${scene.accent}dd 100%);
    display: flex; align-items: center; gap: 60px; padding: 60px 80px;
  }
  .left { flex: 1; color: white; }
  .badge { display: inline-block; background: rgba(255,255,255,0.2); color: white; padding: 6px 14px; border-radius: 999px; font-size: 14px; font-weight: 700; margin-bottom: 24px; letter-spacing: 0.05em; }
  h1 { font-size: 56px; font-weight: 900; line-height: 1.15; margin-bottom: 24px; letter-spacing: -0.02em; }
  p { font-size: 22px; line-height: 1.5; opacity: 0.92; max-width: 520px; }
  .right {
    width: 460px; height: 700px; background: white; border-radius: 12px;
    box-shadow: 0 30px 60px rgba(0,0,0,0.25), 0 6px 20px rgba(0,0,0,0.15);
    overflow: hidden; display: flex; align-items: flex-start; justify-content: center;
    padding: 0;
  }
  .right img { width: 100%; height: auto; display: block; }
  .footer { position: absolute; bottom: 24px; left: 80px; color: rgba(255,255,255,0.7); font-size: 14px; font-weight: 700; letter-spacing: 0.1em; }
</style></head>
<body>
  <div class="left">
    <div class="badge">TUTTI · CROSS-POST CHROME EXTENSION</div>
    <h1>${scene.title}</h1>
    <p>${scene.subtitle}</p>
  </div>
  <div class="right">
    <img src="data:image/png;base64,${popupB64}" alt="popup" />
  </div>
  <div class="footer">クロスポストの面倒を全部肩代わり</div>
</body></html>
  `;
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 500));
  const out = `docs/screenshots/${scene.name}-1280x800.png`;
  await page.screenshot({ path: out, omitBackground: false });
  console.log('wrote', out);
}

await browser.disconnect();
