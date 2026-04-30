import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();

// Close duplicate chrome://extensions/ tabs, keep one
const extPages = pages.filter((p) => p.url() === 'chrome://extensions/');
console.log('chrome://extensions/ tabs:', extPages.length);
for (let i = 1; i < extPages.length; i++) {
  await extPages[i].close();
  console.log(`closed dup ${i}`);
}

const remainingExtPage = extPages[0];
await remainingExtPage.evaluate(() => {
  document.title = '★★★ TEST CHROME - Load Tutti HERE ★★★';
});
await remainingExtPage.bringToFront();
console.log('\nremaining extensions tab title set. bringToFront 済み。');

const finalPages = await browser.pages();
console.log('\nfinal tabs in test Chrome:');
for (const p of finalPages) {
  console.log(`  ${await p.title()} | ${p.url().slice(0, 80)}`);
}

await browser.disconnect();
