import { chromium } from 'playwright';

const needle = process.argv[2] ?? '';
const browser = await chromium.connectOverCDP(process.env.E2E_CDP ?? 'http://localhost:9222', { timeout: 120_000 });
const ctx = browser.contexts()[0];
if (!ctx) throw new Error('CDP context not found');
const page = ctx.pages().find((candidate) =>
  /^chrome-extension:\/\/klmldcimakkjhlbckpkobjdbpnldkikn\//.test(candidate.url()));
if (!page) throw new Error('Tutti extension page not found');

const logs = await page.evaluate(async () =>
  ((await chrome.storage.local.get('logBuffer'))['logBuffer'] ?? []));
console.log(JSON.stringify(logs.filter((entry) =>
  !needle || JSON.stringify(entry).toLowerCase().includes(needle.toLowerCase())), null, 2));
await browser.close();
