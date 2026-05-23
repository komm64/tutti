/**
 * X multi-chunk + image preview の verify (user 報告: 画像だけが表示されてテキストが消える)。
 */
import puppeteer from 'puppeteer-core';
import { deflateSync } from 'node:zlib';

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
  protocolTimeout: 300000, // 5min (X tab + image upload は puppeteer から遅い)
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

// 小さい (100x100) red PNG を生成
function makePng(w, h) {
  const rowSize = w * 4 + 1;
  const raw = Buffer.alloc(rowSize * h);
  for (let y = 0; y < h; y++) {
    raw[y * rowSize] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * rowSize + 1 + x * 4;
      raw[i] = 255; raw[i+1] = 64; raw[i+2] = 64; raw[i+3] = 255;
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

const png = makePng(100, 100);
const imageBase64 = png.toString('base64');

const pages0 = await browser.pages();
let xPagePre = pages0.find((p) => /x\.com/.test(p.url()));
if (!xPagePre) xPagePre = await browser.newPage();
await xPagePre.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await xPagePre.bringToFront();
await new Promise((r) => setTimeout(r, 4000));

console.log('=== X multi-chunk + image preview ===');
const chunks = [
  `Chunk demo (1/2): ${'A '.repeat(80)}END`,
  `Chunk demo (2/2): ${'B '.repeat(80)}END`,
];
const result = await worker.evaluate(async ({ chunks, imageBase64 }) => {
  const tabs = await chrome.tabs.query({ url: 'https://x.com/*' });
  if (!tabs[0]) return { error: 'no X tab' };
  return await chrome.tabs.sendMessage(tabs[0].id, {
    type: 'POST_TO_PLATFORM',
    platform: 'x',
    text: chunks[0],
    textChunks: chunks,
    dryRun: true,
    images: [{ name: 'test.png', type: 'image/png', data: imageBase64 }],
  });
}, { chunks, imageBase64 });
console.log('result:', JSON.stringify(result, null, 2));

const pages = await browser.pages();
const xPage = pages.find((p) => /x\.com/.test(p.url()));
if (xPage) {
  await xPage.bringToFront();
  await new Promise((r) => setTimeout(r, 4000));
  const snap = await xPage.evaluate(() => {
    const textareas = Array.from(document.querySelectorAll('[data-testid^="tweetTextarea_"][contenteditable="true"]'));
    const imagePreviews = document.querySelectorAll('[data-testid="attachments"], img[src^="blob:"]').length;
    const addButtonExists = !!document.querySelector('[data-testid="addButton"]');
    return {
      textareaCount: textareas.length,
      texts: textareas.slice(0, 5).map((t) => (t.textContent ?? '').slice(0, 50)),
      imagePreviews,
      addButtonExists,
    };
  });
  console.log('X compose state:', JSON.stringify(snap, null, 2));
}

browser.disconnect();
