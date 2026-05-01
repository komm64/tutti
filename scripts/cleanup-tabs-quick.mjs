// 重い Brave 状態を整える: pixiv/da/ig/extensions 以外のタブを閉じる
import puppeteer from 'puppeteer-core';
const b = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 120000 });
const KEEP = /pixiv\.net|deviantart\.com|instagram\.com\/?$|extensions\/?$/;
const pages = await b.pages();
console.log('total pages:', pages.length);
for (const p of pages) {
  const url = p.url();
  if (KEEP.test(url)) { console.log('KEEP', url.slice(0, 80)); continue; }
  try { await p.close(); console.log('CLOSED', url.slice(0, 80)); } catch (e) { console.log('FAIL', url.slice(0, 60), e.message?.slice(0, 60)); }
}
await b.disconnect();
