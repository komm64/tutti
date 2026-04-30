import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

async function probe(name, url, attachSelector) {
  console.log(`\n=== ${name} ===`);
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));

  const before = await page.evaluate(() => ({
    fileInputs: document.querySelectorAll('input[type="file"]').length,
  }));
  console.log('before click:', before);

  // Find attach button candidates
  const candidates = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, [role="button"]'));
    return all
      .filter(b => /image|画像|attach|photo|add\s*media/i.test(b.getAttribute('aria-label') ?? '') ||
                   /image|画像|添付/i.test((b.textContent ?? '').slice(0, 30)))
      .slice(0, 6)
      .map(b => ({
        text: (b.textContent ?? '').trim().slice(0, 20),
        aria: b.getAttribute('aria-label'),
        testid: b.getAttribute('data-testid'),
        class: b.getAttribute('class')?.slice(0, 60),
      }));
  });
  console.log('attach button candidates:', JSON.stringify(candidates, null, 2));

  // Click first one matching attachSelector or any "Image"/"画像"
  const clickResult = await page.evaluate((sel) => {
    let btn;
    if (sel) btn = document.querySelector(sel);
    if (!btn) {
      btn = Array.from(document.querySelectorAll('button, [role="button"]')).find(b =>
        /^(image|画像|add image|add photo)$/i.test(b.getAttribute('aria-label') ?? '')
      );
    }
    if (!btn) return { ok: false };
    btn.click();
    return { ok: true, clicked: btn.getAttribute('aria-label') };
  }, attachSelector);
  console.log('click result:', clickResult);

  await new Promise(r => setTimeout(r, 1500));
  const after = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    return {
      fileInputCount: inputs.length,
      inputs: inputs.map(i => ({
        accept: i.accept,
        multiple: i.multiple,
        ancestorTestids: (() => { const a=[]; let c=i; while(c){const t=c.getAttribute?.('data-testid'); if(t)a.push(t); c=c.parentElement;} return a; })(),
      })),
    };
  });
  console.log('after click:', JSON.stringify(after, null, 2));
  await page.close();
}

await probe('Misskey', 'https://misskey.io/share?text=test', null);
await probe('Tumblr', 'https://www.tumblr.com/new/text', null);

await browser.disconnect();
