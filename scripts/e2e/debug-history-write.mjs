// Debug: read postHistory immediately after every change. Should reveal what's
// actually being written by bg's recordHistoryEntry → addToPostHistory.

import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  {
    headless: false,
    args: [
      `--disable-extensions-except=${process.env.E2E_EXT_DIR}`,
      `--load-extension=${process.env.E2E_EXT_DIR}`,
      '--no-first-run',
    ],
  },
);
let extId;
for (let i = 0; i < 50; i += 1) {
  for (const s of ctx.serviceWorkers()) {
    const m = s.url().match(/^chrome-extension:\/\/([a-z]+)\//);
    if (m) { extId = m[1]; break; }
  }
  if (extId) break;
  await new Promise((r) => setTimeout(r, 200));
}

const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/options.html`);
await page.waitForTimeout(500);

// Test 1: synthetic write — does chrome.storage drop new fields?
const synth = await page.evaluate(async () => {
  await chrome.storage.local.set({
    debug: [{
      version: 1,
      id: 'x',
      textPreview: 'preview',
      text: 'the full text',
      bodyHash: 'abc123',
      hasMedia: false,
      mediaRefs: undefined,
      platforms: ['x'],
      results: { x: { success: true, url: undefined, postId: undefined } },
      timestamp: 1,
    }],
  });
  const got = await chrome.storage.local.get('debug');
  return JSON.stringify(got['debug'], null, 2);
});
console.log('=== synthetic write/read ===');
console.log(synth);

// Test 2: call addToPostHistory directly via the bg sw (= production code path)
const sw = ctx.serviceWorkers().find((s) => s.url().startsWith(`chrome-extension://${extId}/`));
if (!sw) { console.error('no bg sw'); process.exit(2); }
// Capture sw console
sw.on('console', (m) => {
  console.log(`[sw:${m.type()}]`, m.text());
});

const directCall = await sw.evaluate(async () => {
  // Wipe storage
  await chrome.storage.local.set({ postHistory: [] });
  // Directly invoke (this requires the symbol be exposed; bg bundle has it as ze).
  // We can't import — best we can do is send POST_REQUEST and observe.
  // Instead, inspect: what is the postHistory IMMEDIATELY after a sendMessage?
  return 'cleared';
});
console.log('=== bg cleared ===', directCall);

// Test 3: send POST_REQUEST with synthetic platforms=[] (no real post), just to trigger addToPostHistory
const resp = await page.evaluate(async () => {
  return await new Promise((res) => {
    chrome.runtime.sendMessage(
      { type: 'POST_REQUEST', text: 'DEBUG_TEXT_MARKER', platforms: [], images: undefined },
      (r) => res(r ?? { err: chrome.runtime.lastError?.message }),
    );
  });
});
console.log('=== POST_REQUEST (empty platforms) response ===', JSON.stringify(resp).slice(0, 200));

// Wait for write
await new Promise((r) => setTimeout(r, 3000));
const got = await page.evaluate(async () => {
  const g = await chrome.storage.local.get('postHistory');
  return JSON.stringify(g['postHistory'], null, 2);
});
console.log('=== postHistory after empty POST_REQUEST ===');
console.log(got);

await ctx.close();
