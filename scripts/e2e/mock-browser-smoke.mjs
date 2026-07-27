/**
 * Local, deterministic browser smoke for Tutti's most fragile posting boundary.
 *
 * This launches a fresh Chromium profile with the built MV3 extension loaded,
 * serves mock compose pages via Playwright routing, then exercises:
 *   1. X popup/background/content preview via chrome.runtime.sendMessage
 *   2. X popup UI preview submission
 *   3. Mastodon executePostFlow preview
 *   4. Instagram executeMultiStepFlow wizard preview
 *
 * It does not log in to or post to any real SNS. On failure, artifacts are
 * written under .tmp/e2e-smoke-*.
 */

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const extensionDir = resolve(repoRoot, '.output', 'chrome-mv3');
const artifactRoot = resolve(repoRoot, '.tmp');
const fixtureRoot = resolve(repoRoot, 'scripts', 'e2e', 'fixtures');
const mockMastodonHtml = await readFile(resolve(fixtureRoot, 'mock-mastodon-compose.html'), 'utf8');
const mockInstagramHtml = await readFile(resolve(fixtureRoot, 'mock-instagram-wizard.html'), 'utf8');
const fixtureImageData =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const selectedPlatforms = {
  x: true,
  bluesky: false,
  threads: false,
  mastodon: false,
  misskey: false,
  tumblr: false,
  pixiv: false,
  deviantart: false,
  instagram: false,
  tiktok: false,
  youtube: false,
};

if (!existsSync(extensionDir)) {
  console.error(`[mock-smoke] missing extension output: ${extensionDir}`);
  console.error('[mock-smoke] Run `npm run build` first.');
  process.exit(2);
}

await mkdir(artifactRoot, { recursive: true });
const userDataDir = await mkdtemp(join(tmpdir(), 'tutti-mock-smoke-profile-'));
const artifactDir = await mkdtemp(join(artifactRoot, 'e2e-smoke-'));

let context;
let popupPage;
const failures = [];

try {
  context = await launchExtensionContext(userDataDir);
  context.setDefaultTimeout(30_000);
  await installMockRoutes(context);

  const extensionId = await detectExtensionId(context);
  console.log(`[mock-smoke] extension id=${extensionId}`);
  popupPage = await openExtensionPage(context, extensionId, 'history.html');
  await resetExtensionStorage(popupPage);
  await ensureMockXComposePage(context);

  await runRuntimePreviewSmoke(popupPage);
  await runPopupPreviewSmoke(context, extensionId);
  await runMastodonSimplePreviewSmoke(context, popupPage);
  await runInstagramWizardPreviewSmoke(context, popupPage);

  console.log('[mock-smoke] PASS');
} catch (error) {
  failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
  await dumpArtifacts(context, popupPage, artifactDir, failures).catch((dumpError) => {
    console.error('[mock-smoke] artifact dump failed:', dumpError);
  });
  console.error(`[mock-smoke] FAIL. Artifacts: ${artifactDir}`);
  throw error;
} finally {
  await context?.close().catch(() => {});
  await rm(userDataDir, { recursive: true, force: true });
  if (failures.length === 0) {
    await rm(artifactDir, { recursive: true, force: true });
  }
}

async function launchExtensionContext(profileDir) {
  console.log(`[mock-smoke] launching Chromium profile=${profileDir}`);
  return await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
}

async function installMockRoutes(ctx) {
  await ctx.route('https://x.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: mockXComposeHtml(),
    });
  });
  await ctx.route('https://twitter.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: mockXComposeHtml(),
    });
  });
  await ctx.route('https://mastodon.social/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: mockMastodonHtml,
    });
  });
  await ctx.route('https://www.instagram.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: mockInstagramHtml,
    });
  });
  await ctx.route('https://instagram.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: mockInstagramHtml,
    });
  });
}

async function detectExtensionId(ctx) {
  for (let i = 0; i < 50; i += 1) {
    for (const worker of ctx.serviceWorkers()) {
      const match = worker.url().match(/^chrome-extension:\/\/([a-z]+)\//);
      if (match?.[1]) return match[1];
    }
    await sleep(200);
  }
  throw new Error('extension service worker not detected');
}

async function openExtensionPage(ctx, extensionId, path) {
  const page = await ctx.newPage();
  page.on('console', (message) => {
    const text = message.text();
    if (/tutti|mock-smoke|error|warn/i.test(text)) {
      console.log(`[browser:${message.type()}] ${text}`);
    }
  });
  await page.goto(`chrome-extension://${extensionId}/${path}`, { waitUntil: 'domcontentloaded' });
  return page;
}

async function resetExtensionStorage(page) {
  await page.evaluate(async ({ selectedPlatforms, seedHistory }) => {
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
    if (chrome.storage.session) await chrome.storage.session.clear();
    await chrome.storage.sync.set({
      settings: {
        autoPost: false,
        autoOpenPostUrl: 'never',
        selectorOverrideUrl: '',
        displayMode: 'popup',
        logLevel: 'INFO',
        uiLanguage: 'en',
      },
    });
    await chrome.storage.local.set({
      selectedPlatforms,
      lastSeenUsers: { x: '@mockuser' },
      postHistory: [seedHistory],
    });
  }, { selectedPlatforms, seedHistory: seedHistoryEntry() });
}

async function runRuntimePreviewSmoke(page) {
  console.log('[mock-smoke] runtime preview smoke');
  const text = twoChunkText('runtime');
  const response = await withTimeout(
    page.evaluate((text) => chrome.runtime.sendMessage({
      type: 'POST_REQUEST',
      requestId: crypto.randomUUID(),
      intent: 'new',
      text,
      platforms: ['x'],
      autoPost: false,
    }), text),
    45_000,
    'runtime POST_REQUEST timed out',
  );

  const result = response?.results?.[0];
  assert(result?.success === true, `runtime preview did not succeed: ${JSON.stringify(response)}`);
  assert(result.preview === true, `runtime preview result missing preview=true: ${JSON.stringify(result)}`);
  assert(!result.url, `runtime preview result carried a URL: ${JSON.stringify(result)}`);

  const history = await getPostHistory(page);
  assert(history.length === 1 && history[0]?.id === 'seed-history', `preview changed history: ${JSON.stringify(history)}`);

  const bgState = await getBackgroundState(page);
  assert(bgState?.posting === false, `background still posting: ${JSON.stringify(bgState)}`);
  assert(bgState?.postingState?.done === true, `background posting state not done: ${JSON.stringify(bgState)}`);
  assert(bgState.postingState.results[0]?.preview === true, `background retained non-preview result: ${JSON.stringify(bgState)}`);

  await page.evaluate(() => chrome.runtime.sendMessage({ type: 'CLEAR_POSTING_STATE' }));
}

async function runPopupPreviewSmoke(ctx, extensionId) {
  console.log('[mock-smoke] popup UI preview smoke');
  await ensureMockXComposePage(ctx);
  const page = await openExtensionPage(ctx, extensionId, 'popup.html');
  await page.waitForSelector('textarea');
  await acceptResponsibleUseIfShown(page);
  await waitForSelectedPlatforms(page, ['X']);

  const text = twoChunkText('popup');
  await page.locator('textarea').fill(text);
  await page.locator('button[title="Ctrl/Cmd + Enter"]').click();

  const doneState = await waitForBackgroundDone(page);
  const result = doneState.postingState.results[0];
  assert(result?.success === true, `popup preview did not succeed: ${JSON.stringify(doneState)}`);
  assert(result.preview === true, `popup preview result missing preview=true: ${JSON.stringify(result)}`);
  assert(!result.url, `popup preview result carried a URL: ${JSON.stringify(result)}`);

  const textareaValue = await page.locator('textarea').inputValue();
  assert(textareaValue === text, 'popup preview cleared the visible draft text');
  await page.waitForTimeout(500);
  const draft = await page.evaluate(() => chrome.storage.session.get('draft'));
  assert(draft?.draft?.text === text, `popup preview did not retain session draft: ${JSON.stringify(draft)}`);

  const history = await getPostHistory(page);
  assert(history.length === 1 && history[0]?.id === 'seed-history', `popup preview changed history: ${JSON.stringify(history)}`);
}

async function runMastodonSimplePreviewSmoke(ctx, extensionPage) {
  console.log('[mock-smoke] Mastodon simple-flow preview smoke');
  const text = `tutti mock mastodon simple ${Date.now()}`;
  const page = await ensureMockMastodonComposePage(ctx, text);
  const response = await withTimeout(
    extensionPage.evaluate((text) => chrome.runtime.sendMessage({
      type: 'POST_REQUEST',
      requestId: crypto.randomUUID(),
      intent: 'new',
      text,
      platforms: ['mastodon'],
      autoPost: false,
    }), text),
    45_000,
    'Mastodon simple-flow POST_REQUEST timed out',
  );

  const result = response?.results?.[0];
  assertPreviewResult(result, 'mastodon');
  assert(
    result.flow?.lastCompletedStep === 'wait-submit',
    `Mastodon simple flow did not reach submit control: ${JSON.stringify(result)}`,
  );

  const state = await page.evaluate(() => window.__tuttiMockMastodonState);
  assert(state?.text === text, `Mastodon text was not injected: ${JSON.stringify(state)}`);
  assert(state?.submitClicks === 0, `Mastodon preview clicked submit: ${JSON.stringify(state)}`);
  await assertSeedHistoryUnchanged(extensionPage, 'Mastodon preview');
}

async function ensureMockMastodonComposePage(ctx, text) {
  const url = `https://mastodon.social/share?text=${encodeURIComponent(text)}`;
  const existing = ctx.pages().find((page) => page.url() === url);
  const page = existing ?? await ctx.newPage();
  if (!existing) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
  const title = await page.title().catch(() => '');
  assert(
    title === 'Mock Mastodon Compose',
    `mock Mastodon route did not load, title="${title}", url=${page.url()}`,
  );
  await page.waitForSelector('textarea.autosuggest-textarea__textarea');
  return page;
}

async function runInstagramWizardPreviewSmoke(ctx, extensionPage) {
  console.log('[mock-smoke] Instagram wizard preview smoke');
  const text = `tutti mock instagram wizard ${Date.now()}`;
  const page = await ensureMockInstagramPage(ctx);
  const response = await withTimeout(
    extensionPage.evaluate(async ({ text, imageData }) => {
      const tabs = await chrome.tabs.query({ url: ['https://www.instagram.com/*'] });
      const tab = tabs.find((candidate) => candidate.title === 'Mock Instagram Wizard');
      if (typeof tab?.id !== 'number') throw new Error('mock Instagram tab not found');
      return await chrome.tabs.sendMessage(tab.id, {
        type: 'POST_TO_PLATFORM',
        platform: 'instagram',
        text,
        images: [{
          name: 'test-image.png',
          type: 'image/png',
          data: imageData,
        }],
        dryRun: true,
      });
    }, { text, imageData: fixtureImageData }),
    60_000,
    'Instagram wizard POST_TO_PLATFORM timed out',
  );

  const result = response;
  assertContentPreviewResult(result, 'instagram');
  assert(
    result.flow?.lastCompletedStep === 'wait-submit',
    `Instagram wizard did not reach Share: ${JSON.stringify(result)}`,
  );

  const state = await page.evaluate(() => window.__tuttiMockInstagramState);
  assert(state?.fileCount === 1, `Instagram image was not injected: ${JSON.stringify(state)}`);
  assert(state?.caption === text, `Instagram caption was not injected: ${JSON.stringify(state)}`);
  assert(
    JSON.stringify(state?.transitions) === JSON.stringify([
      'create',
      'file-selected',
      'crop-original-open',
      'crop-original',
      'crop-next',
      'edit-next',
      'caption-input',
    ]),
    `Instagram wizard transitions changed: ${JSON.stringify(state)}`,
  );
  assert(state?.shareClicks === 0, `Instagram preview clicked Share: ${JSON.stringify(state)}`);
  const shareOutline = await page.locator('#share').evaluate((element) => element.style.outline);
  assert(/dashed/.test(shareOutline), `Instagram Share was not highlighted: ${shareOutline}`);
  await assertSeedHistoryUnchanged(extensionPage, 'Instagram preview');
}

async function ensureMockInstagramPage(ctx) {
  const url = 'https://www.instagram.com/';
  const existing = ctx.pages().find((page) => page.url() === url);
  const page = existing ?? await ctx.newPage();
  if (!existing) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
  const title = await page.title().catch(() => '');
  assert(
    title === 'Mock Instagram Wizard',
    `mock Instagram route did not load, title="${title}", url=${page.url()}`,
  );
  await page.waitForSelector('#create');
  return page;
}

function assertPreviewResult(result, platform) {
  assert(result?.platform === platform, `${platform} result missing: ${JSON.stringify(result)}`);
  assert(result.success === true, `${platform} preview did not succeed: ${JSON.stringify(result)}`);
  assert(result.preview === true, `${platform} preview missing preview=true: ${JSON.stringify(result)}`);
  assertPreviewFlow(result, platform);
}

function assertContentPreviewResult(result, platform) {
  assert(result?.platform === platform, `${platform} result missing: ${JSON.stringify(result)}`);
  assert(result.success === true, `${platform} preview did not succeed: ${JSON.stringify(result)}`);
  assertPreviewFlow(result, platform);
}

function assertPreviewFlow(result, platform) {
  assert(result.flow?.mode === 'preview', `${platform} preview flow mode missing: ${JSON.stringify(result)}`);
  assert(result.flow?.submitReached === false, `${platform} preview reached submit: ${JSON.stringify(result)}`);
  assert(!result.url, `${platform} preview carried a URL: ${JSON.stringify(result)}`);
}

async function assertSeedHistoryUnchanged(page, label) {
  const history = await getPostHistory(page);
  assert(
    history.length === 1 && history[0]?.id === 'seed-history',
    `${label} changed history: ${JSON.stringify(history)}`,
  );
}

async function waitForSelectedPlatforms(page, expectedNames) {
  await page.waitForFunction((expected) => {
    const checkedNames = Array.from(document.querySelectorAll('label'))
      .map((label) => {
        const input = label.querySelector('input[type="checkbox"]');
        const name = label.querySelector('.font-medium')?.textContent?.trim();
        return input?.checked && name ? name : null;
      })
      .filter(Boolean);
    return JSON.stringify(checkedNames) === JSON.stringify(expected);
  }, expectedNames);
}

async function acceptResponsibleUseIfShown(page) {
  const accept = page.getByRole('button', { name: /I understand|理解しました/ });
  if (await accept.count()) {
    await accept.first().click();
    await page.waitForFunction(() => {
      const settings = chrome.storage.sync.get('settings');
      return settings.then((stored) => (stored.settings?.responsibleUseAcceptedVersion ?? 0) >= 1);
    });
  }
}

async function ensureMockXComposePage(ctx) {
  const existing = ctx.pages().find((page) => page.url() === 'https://x.com/compose/post');
  const page = existing ?? await ctx.newPage();
  if (!existing) {
    await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded' });
  }
  const title = await page.title().catch(() => '');
  assert(title === 'Mock X Compose', `mock X route did not load, title="${title}", url=${page.url()}`);
  await page.waitForSelector('[data-testid="tweetTextarea_0"]');
  return page;
}

async function waitForBackgroundDone(page) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45_000) {
    const state = await getBackgroundState(page);
    if (state?.posting === false && state?.postingState?.done === true) return state;
    await sleep(250);
  }
  throw new Error(`background did not finish: ${JSON.stringify(await getBackgroundState(page))}`);
}

async function getBackgroundState(page) {
  return await page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_BG_STATE' }));
}

async function getPostHistory(page) {
  const stored = await page.evaluate(() => chrome.storage.local.get('postHistory'));
  return stored.postHistory ?? [];
}

async function dumpArtifacts(ctx, page, dir, errors) {
  await mkdir(dir, { recursive: true });
  const pages = ctx?.pages?.() ?? [];
  const pageInfo = [];
  for (let i = 0; i < pages.length; i += 1) {
    const target = pages[i];
    if (target.isClosed()) continue;
    pageInfo.push({
      index: i,
      url: target.url(),
      title: await target.title().catch(() => ''),
    });
    await target.screenshot({ path: join(dir, `page-${i}.png`), fullPage: true }).catch(() => {});
  }
  const state = page && !page.isClosed()
    ? {
        history: await getPostHistory(page).catch((e) => ({ error: String(e) })),
        bgState: await getBackgroundState(page).catch((e) => ({ error: String(e) })),
      }
    : {};
  await writeFile(join(dir, 'state.json'), JSON.stringify({ errors, pages: pageInfo, state }, null, 2), 'utf8');
}

function seedHistoryEntry() {
  return {
    version: 1,
    id: 'seed-history',
    textPreview: 'seed',
    text: 'seed',
    platforms: ['x'],
    results: { x: { success: true, confirmed: true, url: 'https://x.com/mockuser/status/1' } },
    hasMedia: false,
    timestamp: Date.now() - 60_000,
  };
}

function twoChunkText(label) {
  const prefix = `tutti mock ${label} ${Date.now()} `;
  return (prefix + '0123456789 '.repeat(40)).slice(0, 360);
}

function mockXComposeHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Mock X Compose</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 32px; }
    [role="dialog"] { width: 640px; border: 1px solid #ddd; padding: 16px; border-radius: 8px; }
    [contenteditable="true"] { min-height: 72px; border: 1px solid #aaa; padding: 8px; margin: 8px 0; white-space: pre-wrap; }
    button { min-width: 96px; min-height: 36px; margin-right: 8px; }
  </style>
</head>
<body>
  <header>
    <nav role="navigation">
      <a aria-label="Profile" role="link" href="/mockuser">Profile</a>
    </nav>
    <button data-testid="SideNav_AccountSwitcher_Button">
      <span data-testid="UserAvatar-Container-mockuser"></span>
    </button>
  </header>
  <main>
    <section role="dialog" aria-label="Compose post">
      <div id="editors">
        <div data-testid="tweetTextarea_0" role="textbox" contenteditable="true" aria-label="Post text"></div>
      </div>
      <input data-testid="fileInput" type="file" multiple style="display:none">
      <button data-testid="addButton" aria-label="Add post" type="button" onclick="window.__tuttiMockAddEditor()">+</button>
      <button data-testid="tweetButton" type="button" onclick="window.__tuttiMockSubmit()">Post</button>
    </section>
  </main>
  <script>
    let editorCount = 1;
    window.__tuttiMockAddEditor = () => {
      const editor = document.createElement('div');
      editor.setAttribute('data-testid', 'tweetTextarea_' + editorCount);
      editor.setAttribute('role', 'textbox');
      editor.setAttribute('contenteditable', 'true');
      editor.setAttribute('aria-label', 'Post text ' + editorCount);
      document.querySelector('#editors').appendChild(editor);
      editorCount += 1;
    };
    window.__tuttiMockSubmit = () => {
      const id = String(Date.now());
      localStorage.setItem('tutti:x-latest-post', JSON.stringify({ id, capturedAt: Date.now() }));
      const link = document.createElement('a');
      link.href = '/mockuser/status/' + id;
      link.textContent = Array.from(document.querySelectorAll('[data-testid^="tweetTextarea_"]'))
        .map((node) => node.textContent || '')
        .join(' ');
      document.body.appendChild(link);
    };
    document.querySelector('[data-testid="addButton"]').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.code === 'Enter') window.__tuttiMockAddEditor();
    });
  </script>
</body>
</html>`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
