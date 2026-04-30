// Open Bluesky compose via intent URL, wait for modal, inspect DOM for post button + file input.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });

const pages = await browser.pages();
let page = pages.find(p => /bsky\.app/.test(p.url())) ?? pages[0];
console.log('navigating to intent URL...');
await page.goto('https://bsky.app/intent/compose?text=' + encodeURIComponent('Test inspect ' + Date.now()), { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 4000));

const info = await page.evaluate(() => {
  // Find dialog/modal
  const dialog = document.querySelector('[role="dialog"]');
  const portal = document.querySelector('div[id^="portal"], [data-radix-portal]');
  // Look for Post button
  const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
  const postBtn = allBtns.find(b => (b.textContent ?? '').trim() === 'Post' || /publish.post/i.test(b.getAttribute('aria-label') ?? ''));
  // Look for file inputs
  const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
  const cancelBtn = allBtns.find(b => (b.textContent ?? '').trim() === 'Cancel');
  // contenteditable for compose body
  const editor = document.querySelector('[contenteditable="true"][role="textbox"], [contenteditable="true"][data-testid]');
  return {
    url: location.href,
    dialogExists: !!dialog,
    dialogTestId: dialog?.getAttribute('data-testid'),
    portalExists: !!portal,
    postBtn: postBtn ? {
      text: (postBtn.textContent ?? '').trim().slice(0, 30),
      aria: postBtn.getAttribute('aria-label'),
      testid: postBtn.getAttribute('data-testid'),
      classList: postBtn.classList?.toString().slice(0, 100),
      tagName: postBtn.tagName,
      // Build a unique selector: ancestor with testid + own attrs
      ancestors: (() => {
        const out = [];
        let cur = postBtn;
        while (cur && out.length < 6) {
          out.push({
            tag: cur.tagName,
            testid: cur.getAttribute?.('data-testid'),
            role: cur.getAttribute?.('role'),
            aria: cur.getAttribute?.('aria-label'),
            class: cur.getAttribute?.('class')?.slice(0, 80),
          });
          cur = cur.parentElement;
        }
        return out;
      })(),
    } : null,
    cancelBtn: cancelBtn ? {
      text: cancelBtn.textContent?.trim(), aria: cancelBtn.getAttribute('aria-label'), testid: cancelBtn.getAttribute('data-testid'),
    } : null,
    fileInputs: fileInputs.map(i => ({
      accept: i.accept,
      multiple: i.multiple,
      hidden: i.offsetParent === null,
      ancestorTestids: (() => {
        const ids = [];
        let c = i;
        while (c) { const t = c.getAttribute?.('data-testid'); if (t) ids.push(t); c = c.parentElement; }
        return ids;
      })(),
    })),
    editor: editor ? {
      tag: editor.tagName,
      testid: editor.getAttribute('data-testid'),
      placeholder: editor.getAttribute('aria-placeholder'),
    } : null,
    // Look for the image attach button
    imgAttachBtn: (() => {
      const all = Array.from(document.querySelectorAll('button, [role="button"]'));
      const cand = all.filter(b => /add.*image|image|gif/i.test(b.getAttribute('aria-label') ?? ''));
      return cand.slice(0, 5).map(b => ({
        aria: b.getAttribute('aria-label'),
        testid: b.getAttribute('data-testid'),
        text: (b.textContent ?? '').trim().slice(0, 20),
      }));
    })(),
  };
});

console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/bsky-inspect.png' });
console.log('screenshot saved');

await browser.disconnect();
