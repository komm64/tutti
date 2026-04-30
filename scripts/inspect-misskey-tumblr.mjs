import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

async function inspect(name, url, postSel, postTexts, fileSel) {
  console.log(`\n========== ${name} ==========`);
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));
  const info = await page.evaluate(({ postSel, postTexts, fileSel }) => {
    const postViaCss = document.querySelector(postSel);
    const all = Array.from(document.querySelectorAll('button, [role="button"]'));
    const postViaText = all.find((el) => {
      const t = (el.textContent ?? '').trim();
      return postTexts.includes(t);
    });
    const fi = document.querySelector(fileSel);
    const allFi = Array.from(document.querySelectorAll('input[type="file"]'));
    return {
      url: location.href,
      postViaCss: postViaCss ? { tag: postViaCss.tagName, text: postViaCss.textContent?.trim()?.slice(0, 30), aria: postViaCss.getAttribute('aria-label'), disabled: postViaCss.disabled } : null,
      postViaText: postViaText ? { tag: postViaText.tagName, text: postViaText.textContent?.trim()?.slice(0, 30), disabled: postViaText.disabled } : null,
      fileInputViaCss: fi ? { accept: fi.accept, multiple: fi.multiple } : null,
      allFileInputCount: allFi.length,
      allFileInputs: allFi.slice(0, 5).map(f => ({ accept: f.accept, multiple: f.multiple, ancestorTestids: (() => { const a=[]; let c=f; while(c){const t=c.getAttribute?.('data-testid'); if(t)a.push(t); c=c.parentElement;} return a; })() })),
      // Sample submit-like buttons
      submitButtons: all.filter(b => b.type === 'submit' || /post|publish|投稿|note|share/i.test(b.textContent ?? '')).slice(0, 8).map(b => ({
        text: (b.textContent ?? '').trim().slice(0, 30),
        type: b.type,
        aria: b.getAttribute('aria-label'),
        testid: b.getAttribute('data-testid'),
        class: b.getAttribute('class')?.slice(0, 80),
        disabled: b.disabled,
      })),
    };
  }, { postSel, postTexts, fileSel });
  console.log(JSON.stringify(info, null, 2));
  await page.close();
}

// Tutti's current selectors
await inspect(
  'Misskey',
  'https://misskey.io/share?text=' + encodeURIComponent('test ' + Date.now()),
  '[data-cy-post-form-submit], button._button._buttonPrimary[type="submit"]',
  ['投稿', 'ノート', 'Note', 'Post', 'Submit'],
  '[data-cy-post-form-file] input[type="file"], input[type="file"][accept*="image"]',
);

await inspect(
  'Tumblr',
  'https://www.tumblr.com/new/text',
  '[data-testid="postFormPostButton"], button[aria-label="Post"]',
  ['Post', '投稿', 'Publish'],
  '[data-testid="postFormFile"] input[type="file"], input[type="file"][accept*="image"]',
);

await browser.disconnect();
