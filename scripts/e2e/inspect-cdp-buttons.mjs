import { chromium } from 'playwright';

const needle = process.argv[2] ?? '';
const urlPattern = new RegExp(process.argv[3] ?? '');
const browser = await chromium.connectOverCDP(process.env.E2E_CDP ?? 'http://localhost:9222', { timeout: 120_000 });
const ctx = browser.contexts()[0];
if (!ctx) throw new Error('CDP context not found');

for (const page of ctx.pages()) {
  if (!/^https?:/.test(page.url())) continue;
  if (!urlPattern.test(page.url())) continue;
  const state = await page.evaluate((text) => {
    const body = document.body?.innerText ?? '';
    if (text && !body.includes(text) && !/misskey\.io\/share/.test(location.href)) return null;
    const summarize = (el) => ({
      tag: el.tagName,
      text: (el.textContent ?? '').trim().slice(0, 160),
      ariaLabel: el.getAttribute('aria-label'),
      testId: el.getAttribute('data-testid'),
      dataCy: el.getAttribute('data-cy-post-form-submit'),
      disabled: el.disabled ?? null,
      ariaDisabled: el.getAttribute('aria-disabled'),
      type: el.getAttribute('type'),
      classes: el.className?.toString().slice(0, 240),
    });
    return {
      url: location.href,
      inputs: [...document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]')]
        .map((el) => ({
          tag: el.tagName,
          text: (el.value ?? el.textContent ?? '').slice(0, 160),
          classes: el.className?.toString().slice(0, 240),
          dataCy: el.getAttribute('data-cy-post-form-text'),
          contenteditable: el.getAttribute('contenteditable'),
        })),
      dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
        .map((dialog) => ({
          text: (dialog.textContent ?? '').trim().slice(0, 500),
          buttons: [...dialog.querySelectorAll('button, [role="button"]')].map(summarize),
        })),
      allButtons: [...document.querySelectorAll('button, [role="button"]')].map(summarize)
        .filter(({ text: buttonText, ariaLabel }) => /post|publish|投稿|note|ノート|close|cancel/i.test(`${buttonText} ${ariaLabel ?? ''}`))
        .slice(0, 60),
    };
  }, needle).catch((error) => ({ error: String(error) }));
  if (state) {
    console.log('\n=== PAGE ===');
    console.log(JSON.stringify(state, null, 2));
  }
}

await browser.close();
