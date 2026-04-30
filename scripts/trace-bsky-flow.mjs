// Open Bluesky intent URL fresh, inject Tutti's post-flow logic equivalent and trace each step.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
let page = pages.find(p => /bsky\.app/.test(p.url())) ?? pages[0];

await page.goto('https://bsky.app/intent/compose?text=' + encodeURIComponent('Trace test ' + Date.now()), { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));

// Trace: every 500ms, log what we can find
const trace = await page.evaluate(async () => {
  const events = [];
  const start = Date.now();
  for (let i = 0; i < 20; i++) {
    const t = Date.now() - start;
    const dialog = document.querySelector('[role="dialog"]');
    const postBtn = document.querySelector('[aria-label="Publish post"], [data-testid="composerPublishBtn"]');
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const composerView = document.querySelector('[data-testid="composePostView"]');
    const editor = document.querySelector('[contenteditable="true"][role="textbox"]');
    events.push({
      t,
      dialog: !!dialog,
      postBtn: postBtn ? { aria: postBtn.getAttribute('aria-label'), testid: postBtn.getAttribute('data-testid'), disabled: postBtn.disabled || postBtn.getAttribute('aria-disabled') === 'true' } : null,
      composerView: !!composerView,
      editor: !!editor,
      fileInputCount: fileInputs.length,
      fileInputs: fileInputs.map(f => ({ accept: f.accept, parentTestid: f.closest('[data-testid]')?.getAttribute('data-testid') })),
    });
    await new Promise(r => setTimeout(r, 500));
  }
  return events;
});

console.log('trace events:');
for (const e of trace) {
  const pb = e.postBtn ? `postBtn(disabled=${e.postBtn.disabled})` : 'NO_BTN';
  console.log(`  t=${e.t}ms dialog=${e.dialog} composer=${e.composerView} editor=${e.editor} ${pb} fileInputs=${e.fileInputCount}`);
}
console.log('\nfile inputs at end:', JSON.stringify(trace[trace.length - 1].fileInputs, null, 2));

await browser.disconnect();
