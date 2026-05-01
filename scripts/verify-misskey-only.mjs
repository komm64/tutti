import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (/misskey\.io/.test(p.url())) await p.close();
}
const page = await browser.newPage();
await page.goto('https://misskey.io/@ren_fujimoto', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 6000));

// Dismiss any privacy/welcome modal by clicking "全て許可" or any close-like button
await page.evaluate(() => {
  const allowAll = Array.from(document.querySelectorAll('button')).find(b => /全て許可|Allow all|許可/i.test(b.textContent ?? ''));
  if (allowAll) { allowAll.click(); console.log('clicked allow all'); }
});
await new Promise(r => setTimeout(r, 2000));

// Click the "ノート" tab to see posts
await page.evaluate(() => {
  const noteTab = Array.from(document.querySelectorAll('a, button')).find(b => /^(ノート|Notes)$/i.test(b.textContent?.trim() ?? ''));
  if (noteTab) { noteTab.click(); }
});
await new Promise(r => setTimeout(r, 4000));

await page.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/verify-misskey-notes.png' });

// Look for any visible post text
const text = await page.evaluate(() => document.body.innerText.slice(0, 3000));
const hasMatch = text.includes('Tutti自動投稿');
console.log('found Tutti post on Misskey:', hasMatch);
console.log('snippet:', text.substr(text.indexOf('Tutti'), 200) || '(not in body)');

await browser.disconnect();
