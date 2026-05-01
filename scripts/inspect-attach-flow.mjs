// For each lazy-input SNS, click the attach button and observe DOM changes.
// We want to know: does clicking the attach button (a) open OS picker only,
// or (b) mount a file input we can write to?
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

async function probe(label, url, attachClick) {
  console.log(`\n=== ${label} ===`);
  for (const p of await browser.pages()) {
    if (p.url().includes(label.toLowerCase())) await p.close();
  }
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));

  // Patch HTMLInputElement.click to log + suppress OS picker
  await page.evaluate(() => {
    const orig = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') {
        console.log('[probe] file input.click() suppressed:', this.outerHTML.slice(0, 300));
        return; // suppress
      }
      return orig.call(this);
    };
  });

  page.on('console', m => console.log(`  [page]`, m.text().slice(0, 250)));

  const before = await page.evaluate(() => document.querySelectorAll('input[type="file"]').length);
  console.log(`  before: ${before} file inputs`);

  await page.evaluate(attachClick);
  await new Promise(r => setTimeout(r, 2000));

  const after = await page.evaluate(() => {
    const fis = Array.from(document.querySelectorAll('input[type="file"]'));
    return fis.map(f => ({
      accept: f.accept,
      multiple: f.multiple,
      attrs: Object.fromEntries(Array.from(f.attributes).map(a => [a.name, a.value])),
      ancestorClasses: (() => {
        const c = []; let n = f;
        while (n && c.length < 5) { c.push(n.className?.slice?.(0, 60) ?? ''); n = n.parentElement; }
        return c;
      })(),
    }));
  });
  console.log(`  after: ${after.length} file inputs`);
  for (const f of after) console.log(`    ${JSON.stringify(f)}`);

  await page.close();
}

await probe('Bluesky',
  'https://bsky.app/intent/compose?text=lazy-test',
  () => {
    const btn = document.querySelector('[aria-label="Add image"], [data-testid="openMediaBtn"]')
              || Array.from(document.querySelectorAll('button')).find(b => /Add image|画像|image/i.test(b.getAttribute('aria-label') ?? ''));
    btn?.click();
  });

await probe('Misskey',
  'https://misskey.io/share?text=lazy-test',
  () => {
    // Misskey の attach button (icon-only) を最初に押せば file 種類選択 menu が出るかも
    // ./compose-form 直下の最初の <button> がアイコンメニュー？ 様々なクラス
    const btns = Array.from(document.querySelectorAll('button'));
    // クリップアイコン或いは "ファイル" / Image を含む
    const cand = btns.find(b => {
      const t = (b.title ?? '') + ' ' + (b.getAttribute('aria-label') ?? '') + ' ' + (b.textContent ?? '');
      return /file|attach|添付|ファイル|image|画像/i.test(t);
    });
    console.log('[probe] misskey candidate:', cand?.outerHTML?.slice(0, 200));
    cand?.click();
  });

await probe('Tumblr',
  'https://www.tumblr.com/new/text',
  () => {
    const btn = document.querySelector('[aria-label="Image"], [aria-label="Add photo"]');
    console.log('[probe] tumblr candidate:', btn?.outerHTML?.slice(0, 200));
    btn?.click();
  });

await browser.disconnect();
