#!/usr/bin/env node
// Launch Chromium with .output/chrome-mv3 loaded, switch through representative
// locales via Options page, capture screenshots + assert a few translated strings.
// Run: node scripts/verify-i18n-ui.mjs

import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EXT_DIR = join(ROOT, '.output', 'chrome-mv3');
const OUT_DIR = join(ROOT, '.tmp', 'i18n-shots');

// Representative locales: covers Latin, Cyrillic, CJK, Arabic (RTL), Greek, Thai
const LOCALES_TO_TEST = ['en', 'ja', 'zh_CN', 'ko', 'es', 'de', 'fr', 'ru', 'ar', 'el', 'th', 'eo'];

async function loadMessages(code) {
  const raw = await readFile(join(EXT_DIR, '_locales', code, 'messages.json'), 'utf8');
  return JSON.parse(raw);
}

async function getExtensionId(context) {
  // Find the extension's background service worker, parse id from URL.
  for (let i = 0; i < 30; i += 1) {
    const sws = context.serviceWorkers();
    if (sws.length > 0) {
      const url = sws[0].url();
      const m = url.match(/chrome-extension:\/\/([a-z]+)\//);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('extension service worker not detected');
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const userDataDir = join(tmpdir(), `tutti-i18n-${Date.now()}`);

  console.log(`Launching Chromium with extension from ${EXT_DIR}...`);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,  // extensions require headed mode
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      '--no-first-run',
    ],
  });

  const extId = await getExtensionId(context);
  console.log(`Extension id: ${extId}`);

  const optionsUrl = `chrome-extension://${extId}/options.html`;
  const results = [];

  for (const locale of LOCALES_TO_TEST) {
    const page = await context.newPage();
    try {
      // Pre-seed storage.sync.settings.uiLanguage via a background-side eval.
      await page.goto(optionsUrl);
      await page.waitForLoadState('networkidle');

      // Set uiLanguage in storage and wait for reactive reload
      await page.evaluate(async (lang) => {
        // eslint-disable-next-line no-undef
        await chrome.storage.sync.set({ settings: { uiLanguage: lang } });
      }, locale);

      // Reload to let init pick up new locale
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      const shot = join(OUT_DIR, `options-${locale}.png`);
      await page.screenshot({ path: shot, fullPage: true });

      // Read expected translations from messages.json and check page text contains them
      const messages = await loadMessages(locale);
      const expectedKeys = ['optionsTitle', 'displayModeTitle', 'uiLanguageTitle'];
      const checks = [];
      for (const k of expectedKeys) {
        const expected = messages[k]?.message;
        if (!expected) {
          checks.push(`  ⚠ key not in messages.json: ${k}`);
          continue;
        }
        const visible = await page.evaluate((needle) => document.body.innerText.includes(needle), expected);
        checks.push(`  ${visible ? '✓' : '✗'} ${k}: "${expected.slice(0, 40)}${expected.length > 40 ? '…' : ''}"`);
      }

      const allPassed = checks.every((c) => c.startsWith('  ✓'));
      results.push({ locale, ok: allPassed, screenshot: shot, checks });
      console.log(`\n[${locale}] ${allPassed ? '✓' : '✗'}`);
      checks.forEach((c) => console.log(c));
    } catch (e) {
      results.push({ locale, ok: false, error: String(e) });
      console.log(`\n[${locale}] ✗ ERROR: ${e}`);
    } finally {
      await page.close();
    }
  }

  await context.close();

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n=== Summary: ${okCount}/${LOCALES_TO_TEST.length} locales rendered correctly ===`);
  console.log(`Screenshots in ${OUT_DIR}`);

  const reportPath = join(OUT_DIR, 'report.json');
  await writeFile(reportPath, JSON.stringify(results, null, 2));
  console.log(`Report: ${reportPath}`);

  if (okCount !== LOCALES_TO_TEST.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
