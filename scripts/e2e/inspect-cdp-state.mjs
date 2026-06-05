import { chromium } from 'playwright';

const needle = process.argv[2] ?? '';
const browser = await chromium.connectOverCDP(process.env.E2E_CDP ?? 'http://localhost:9222', { timeout: 120_000 });
const ctx = browser.contexts()[0];
if (!ctx) throw new Error('CDP context not found');

for (const page of ctx.pages()) {
  if (!/^https?:|^chrome-extension:/.test(page.url())) continue;
  const state = await page.evaluate((text) => ({
    url: location.href,
    title: document.title,
    hasNeedle: !!text && (document.body?.innerText ?? '').includes(text),
    excerpt: (document.body?.innerText ?? '').slice(0, 900),
    dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
      .map((dialog) => (dialog.textContent ?? '').trim().slice(0, 900))
      .filter(Boolean),
  }), needle).catch((error) => ({ url: page.url(), error: String(error) }));
  if (state.hasNeedle || state.dialogs?.length || /chrome-extension:/.test(page.url())) {
    console.log('\n=== PAGE ===');
    console.log(JSON.stringify(state, null, 2));
  }
}

const extensionPage = ctx.pages().find((page) => /^chrome-extension:\/\/klmldcimakkjhlbckpkobjdbpnldkikn\//.test(page.url()));
if (extensionPage) {
  const logs = await extensionPage.evaluate(async () =>
    ((await chrome.storage.local.get('logBuffer'))['logBuffer'] ?? []).slice(-120));
  console.log('\n=== LOGS ===');
  console.log(JSON.stringify(logs, null, 2));
}

await browser.close();
