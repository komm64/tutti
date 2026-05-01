// X has 2 file inputs visible at /intent/post: the intent modal compose AND
// the homepage's "what's happening" compose. Find which is which and how to
// target only the intent modal.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (/x\.com|twitter\.com/.test(p.url())) await p.close();
}
const page = await browser.newPage();
await page.goto('https://x.com/intent/post?text=two-forms-probe', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));

const result = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
  return inputs.map((input, idx) => {
    // Walk up to find the closest compose container
    let n = input;
    const ancestors = [];
    while (n && ancestors.length < 12) {
      ancestors.push({
        tag: n.tagName,
        testid: n.getAttribute?.('data-testid'),
        aria: n.getAttribute?.('aria-label'),
        role: n.getAttribute?.('role'),
        classSnip: n.className?.slice?.(0, 40),
      });
      n = n.parentElement;
    }
    // Identify if this input is in a modal/dialog
    const inDialog = !!input.closest('[role="dialog"]');
    const inModal = !!input.closest('[aria-modal="true"]');
    // What's the closest compose-like ancestor?
    const closestCompose = input.closest('[data-testid*="ompose"], [data-testid*="weet"], [data-testid*="oast"], [aria-label*="compose"], [aria-label*="ost"]');
    return {
      idx,
      accept: input.accept,
      multiple: input.multiple,
      inDialog,
      inModal,
      closestComposeTestid: closestCompose?.getAttribute('data-testid'),
      closestComposeAria: closestCompose?.getAttribute('aria-label'),
      ancestors: ancestors.filter(a => a.testid || a.aria || a.role),
      rect: (() => {
        // Visibility check via the input or its container
        const r = (closestCompose || input).getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      })(),
    };
  });
});

console.log(JSON.stringify(result, null, 2));

// Also see what the URL-driven modal looks like
const modalInfo = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  return dialog ? {
    aria: dialog.getAttribute('aria-label'),
    testid: dialog.getAttribute('data-testid'),
    fileInputCount: dialog.querySelectorAll('input[type="file"]').length,
  } : null;
});
console.log('\n[role=dialog]:', JSON.stringify(modalInfo, null, 2));

await page.screenshot({ path: 'C:/Users/komm64/Projects/tutti/scripts/x-two-forms.png' });
await browser.disconnect();
