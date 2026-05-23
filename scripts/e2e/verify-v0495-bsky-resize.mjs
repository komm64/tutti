/**
 * v0.4.95 verify: Bluesky の image auto-resize が validation 前に走るか。
 *
 * tutti-issues#32 の再現: 4.8MB 写真を Bluesky に投稿しようとすると
 * 「too large (max 1.0 MB, actual 4.8 MB)」 で reject されていた。
 * 修正後は per-platform で 2MB 以下に縮小されて preview が成功する。
 */
import puppeteer from 'puppeteer-core';
import { deflateSync } from 'node:zlib';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 120000,
});
const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';

let sw = browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes(EXT_ID));
if (!sw) {
  const p = await browser.newPage();
  try { await p.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 }); } catch {}
  for (let i = 0; i < 50; i++) {
    sw = browser.targets().find((t) => t.type() === 'service_worker' && t.url().includes(EXT_ID));
    if (sw) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await p.close().catch(() => {});
}
const worker = await sw.worker();

// 1500x1500 noise PNG を生成 (random data なので deflate しても縮まらず ~9MB)
function makeBigNoisePng(w, h) {
  const rowSize = w * 4 + 1;
  const raw = Buffer.alloc(rowSize * h);
  for (let y = 0; y < h; y++) {
    raw[y * rowSize] = 0; // filter
    for (let x = 0; x < w; x++) {
      const i = y * rowSize + 1 + x * 4;
      raw[i] = Math.floor(Math.random() * 256);
      raw[i + 1] = Math.floor(Math.random() * 256);
      raw[i + 2] = Math.floor(Math.random() * 256);
      raw[i + 3] = 255;
    }
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const body = Buffer.concat([t, data]);
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0; }
    let c = 0xffffffff;
    for (const b of body) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    const crc = Buffer.alloc(4); crc.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

console.log('generating noisy PNG (1500x1500)...');
const png = makeBigNoisePng(1500, 1500);
const base64 = png.toString('base64');
const mb = (png.length / 1024 / 1024).toFixed(2);
console.log(`PNG bytes: ${png.length} (${mb} MB), base64 length: ${base64.length}`);

// Bluesky tab を /intent/compose にして compose 開いてから test
const pages0 = await browser.pages();
let bskyPagePre = pages0.find((p) => /bsky\.app/.test(p.url()));
if (!bskyPagePre) bskyPagePre = await browser.newPage();
await bskyPagePre.goto('https://bsky.app/intent/compose?text=', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await bskyPagePre.bringToFront();
await new Promise((r) => setTimeout(r, 4500));

// SW から sendMessage は自分の listener に届かないので popup を開いてそこから送る
const popupPage = await browser.newPage();
await popupPage.goto(`chrome-extension://${EXT_ID}/popup.html`, { timeout: 8000 });
await new Promise((r) => setTimeout(r, 1500));

// 元 settings をバックアップして autoPost=false 強制 (preview mode で確認)
// settings は storage.sync 側。
const origAutoPost = await popupPage.evaluate(async () => {
  const { settings } = await chrome.storage.sync.get('settings');
  const orig = settings?.autoPost ?? false;
  await chrome.storage.sync.set({ settings: { ...(settings ?? {}), autoPost: false } });
  return orig;
});
console.log('settings.autoPost overridden to false (orig:', origAutoPost, ')');

console.log('\n=== Bluesky big image preview ===');
const result = await popupPage.evaluate(async ({ base64 }) => {
  return await chrome.runtime.sendMessage({
    type: 'POST_REQUEST',
    text: 'big-image v0.4.95 verify',
    platforms: ['bluesky'],
    images: [{
      name: 'noise.png',
      type: 'image/png',
      data: base64,
    }],
  });
}, { base64 });
console.log('result:', JSON.stringify(result, null, 2));

// settings.autoPost を元に戻す
await popupPage.evaluate(async (orig) => {
  const { settings } = await chrome.storage.sync.get('settings');
  await chrome.storage.sync.set({ settings: { ...(settings ?? {}), autoPost: orig } });
}, origAutoPost);

await popupPage.close().catch(() => {});

browser.disconnect();
