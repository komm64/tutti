// Inspect each compose UI's attach button structure to find selectors that
// open the file input WITHOUT triggering the OS file picker (i.e., they just
// reveal a hidden <input type="file"> that we can write to).
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

async function probe(label, url, getSelectors) {
  console.log(`\n=== ${label} ===`);
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));

  const initial = await page.evaluate(() => ({
    fileInputs: Array.from(document.querySelectorAll('input[type="file"]')).map(f => ({
      accept: f.accept, multiple: f.multiple,
      attrs: Object.fromEntries(Array.from(f.attributes).map(a => [a.name, a.value])),
    })),
  }));
  console.log(`  initial file inputs: ${initial.fileInputs.length}`);
  for (const f of initial.fileInputs) console.log(`    ${JSON.stringify(f)}`);

  const candidates = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, [role="button"], a, label'));
    return all
      .filter(b => {
        const aria = b.getAttribute('aria-label') ?? '';
        const text = (b.textContent ?? '').trim();
        const tip = b.getAttribute('title') ?? '';
        return /image|photo|attach|gif|画像|添付|ファイル|media/i.test(aria + ' ' + text + ' ' + tip);
      })
      .slice(0, 12)
      .map(b => ({
        tag: b.tagName,
        text: (b.textContent ?? '').trim().slice(0, 30),
        aria: b.getAttribute('aria-label'),
        tip: b.getAttribute('title'),
        testid: b.getAttribute('data-testid'),
        forAttr: b.getAttribute('for'),
        hasInputChild: !!b.querySelector('input[type="file"]'),
      }));
  });
  console.log('  attach-like candidates:');
  for (const c of candidates) console.log(`    ${JSON.stringify(c)}`);

  await page.close();
}

await probe('Bluesky', 'https://bsky.app/intent/compose?text=test');
await probe('Misskey', 'https://misskey.io/share?text=test');
await probe('Tumblr', 'https://www.tumblr.com/new/text');

await browser.disconnect();
