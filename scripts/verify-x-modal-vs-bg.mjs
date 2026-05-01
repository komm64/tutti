// Open X with intent URL, check both modal compose AND inline (home) compose
// for text + image state. Verify only modal has the image.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (/x\.com|twitter\.com/.test(p.url())) await p.close();
}
const page = await browser.newPage();
await page.goto('https://x.com/intent/post?text=BG-CHECK-' + Date.now(), { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 6000));

const state = await page.evaluate(() => {
  // Modal textarea (in dialog)
  const dialogTa = document.querySelector('[role="dialog"] [data-testid="tweetTextarea_0"]');
  // Inline (home) textarea — anywhere NOT in dialog
  const inlineTa = (() => {
    const all = Array.from(document.querySelectorAll('[data-testid^="tweetTextarea_"]'));
    return all.find(t => !t.closest('[role="dialog"]'));
  })();
  // Modal Post button
  const dialogPostBtn = document.querySelector('[role="dialog"] [data-testid="tweetButton"]');
  const inlinePostBtn = document.querySelector('[data-testid="tweetButtonInline"]');

  return {
    modal: {
      hasTextarea: !!dialogTa,
      text: dialogTa?.textContent?.slice(0, 80),
      hasPostBtn: !!dialogPostBtn,
    },
    inline: {
      hasTextarea: !!inlineTa,
      text: inlineTa?.textContent?.slice(0, 80),
      hasPostBtn: !!inlinePostBtn,
    },
    blobImgs: Array.from(document.querySelectorAll('img[src^="blob:"]')).map(img => ({
      inDialog: !!img.closest('[role="dialog"]'),
      src: img.src.slice(0, 30),
    })),
  };
});

console.log(JSON.stringify(state, null, 2));
await page.screenshot({ path: 'scripts/x-bg-check.png', fullPage: true });

await browser.disconnect();
