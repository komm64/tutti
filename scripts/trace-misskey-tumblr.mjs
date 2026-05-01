import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

async function trace(name, url, screenshotPath) {
  console.log(`\n=== ${name} trace ===`);
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  for (let i = 0; i < 16; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const snap = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button, [role="button"]'));
      const candidates = all.filter(b => {
        const t = (b.textContent ?? '').trim();
        return /^(Post|Publish|投稿|ノート)$/.test(t);
      });
      const fileInputs = document.querySelectorAll('input[type="file"]').length;
      const editors = Array.from(document.querySelectorAll('[contenteditable="true"], textarea')).map(e => ({ tag: e.tagName, role: e.getAttribute('role'), testid: e.getAttribute('data-testid') }));
      return {
        candidates: candidates.map(b => ({ text: (b.textContent ?? '').trim().slice(0, 20), aria: b.getAttribute('aria-label'), testid: b.getAttribute('data-testid'), class: b.getAttribute('class')?.slice(0, 60), disabled: b.disabled }))
          .slice(0, 5),
        fileInputs,
        editorCount: editors.length,
        editors: editors.slice(0, 3),
      };
    });
    if (snap.candidates.length > 0 || (snap.fileInputs > 0 && i > 5)) {
      console.log(`t=${i}s candidates=${snap.candidates.length} fileInputs=${snap.fileInputs} editors=${snap.editorCount}`);
      console.log('  ', JSON.stringify(snap.candidates));
    }
  }

  await page.screenshot({ path: screenshotPath });
  console.log(`screenshot: ${screenshotPath}`);
  await page.close();
}

await trace('Misskey', 'https://misskey.io/share?text=test', 'scripts/misskey-trace.png');
await trace('Tumblr', 'https://www.tumblr.com/new/text', 'scripts/tumblr-trace.png');

await browser.disconnect();
