import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

// browser-level CDP session
const session = await browser.target().createCDPSession();

const extPath = 'C:\\Users\\komm64\\Projects\\tutti\\.output\\chrome-mv3';
console.log('loading extension via Extensions.loadUnpacked...');
try {
  const res = await session.send('Extensions.loadUnpacked', { path: extPath });
  console.log('loaded:', res);
} catch (e) {
  console.log('error:', e.message);
}

// targets を確認
await new Promise(r => setTimeout(r, 2000));
const targets = await browser.targets();
const exts = targets.filter((t) => t.url().startsWith('chrome-extension://'));
console.log('\nExtension targets:');
for (const t of exts) {
  console.log(`  type=${t.type()} url=${t.url().slice(0, 100)}`);
}

await browser.disconnect();
