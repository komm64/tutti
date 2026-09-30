/**
 * Native-hidden X #97 regression, preview only. Run without another Playwright
 * connection: Playwright enables focus emulation and masks the missing blur.
 * E2E_CDP / E2E_EXTENSION_ID select the Surface test browser and staged artifact.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { connectPuppeteerCdp, resolveExtensionId, withTimeout } from './cdp-harness.mjs';
import { createXThreePartDraft, matchesPreviewThread } from './surface-posting-matrix-contract.mjs';

const { values } = parseArgs({ options: {
  repeat: { type: 'string', default: '2' },
  'hide-at': { type: 'string', default: 'navigation' },
  'summary-json': { type: 'string' },
} });
const repeat = Number(values.repeat);
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 5) throw new Error('--repeat must be 1..5');
if (!['navigation', 'ready'].includes(values['hide-at'])) throw new Error('--hide-at must be navigation or ready');
if (!values['summary-json']) throw new Error('--summary-json must point to this task\'s scratch directory');
const output = resolve(values['summary-json']);
const browser = await connectPuppeteerCdp({ timeoutMs: 15_000 });
browser.on('targetcreated', async target => {
  const page = await target.page().catch(() => null);
  // chrome.tabs.remove may raise X's draft-discard beforeunload prompt.
  // These are new test pages only; never attach to an existing user's tab.
  page?.on('dialog', dialog => {
    if (dialog.type() === 'beforeunload') void dialog.accept().catch(() => {});
  });
});
let popup;
const report = { case: 'text-thread-three', mode: 'preview', hideAt: values['hide-at'], browser: await browser.version(), iterations: [] };
try {
  const extensionId = await resolveExtensionId(browser);
  popup = await browser.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  report.extensionVersion = await popup.evaluate(() => chrome.runtime.getManifest().version);
  const initial = await popup.evaluate(async () => ({
    tabs: (await chrome.tabs.query({})).map(tab => tab.id),
    state: (await chrome.runtime.sendMessage({ type: 'GET_BG_STATE' }))?.postingState,
  }));
  if (initial.state && !initial.state.done) throw new Error('Another posting request is active');
  // Never reuse/close a pre-existing user draft. The dedicated profile should
  // start without an X compose page; Tutti may otherwise reuse it in preview.
  if ((await browser.pages()).some(page => /^https:\/\/x\.com\/(?:compose|intent)\//.test(page.url()))) {
    throw new Error('Close existing X compose tabs before this isolated regression');
  }

  for (let iteration = 1; iteration <= repeat; iteration++) {
    const requestId = crypto.randomUUID();
    const draft = createXThreePartDraft(`hidden-${Date.now()}`);
    const before = await popup.evaluate(async () => JSON.stringify((await chrome.storage.local.get('postHistory')).postHistory ?? []));
    const ownedTabs = new Set();
    let coverId;
    let state;
    let last;
    let hiddenSamples = 0;
    let completeHiddenSamples = 0;
    let hiddenWhileBuildingSamples = 0;
    let error;
    try {
      await popup.evaluate(({ requestId, text }) => chrome.runtime.sendMessage({
        type: 'POST_REQUEST', requestId, intent: 'new', text, platforms: ['x'], images: [], autoPost: false,
      }), { requestId, text: draft.text });
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        const sample = await withTimeout(popup.evaluate(async ({ initialIds, coverId, hideAt, firstChunk }) => {
          const tabs = (await chrome.tabs.query({ url: 'https://x.com/*' }))
            .filter(tab => !initialIds.includes(tab.id));
          const tab = tabs.filter(tab => /\/(?:compose|intent)\//.test(tab.url ?? '')).at(-1);
          const ready = hideAt === 'navigation' || (tab && (await chrome.scripting.executeScript({
            target: { tabId: tab.id }, args: [firstChunk],
            func: expected => [...document.querySelectorAll('[role="dialog"] [data-testid="tweetTextarea_0"]')]
              .some(editor => editor.innerText?.trim() === expected.trim() &&
                editor.closest('[role="dialog"]')?.querySelector('[data-testid="addButton"]')),
          }).catch(() => []))[0]?.result);
          if (tab && ready) {
            const cover = coverId ? await chrome.tabs.get(coverId).catch(() => null) : null;
            if (!cover || cover.windowId !== tab.windowId) {
              if (cover) await chrome.tabs.remove(cover.id);
              coverId = (await chrome.tabs.create({ windowId: tab.windowId, url: 'about:blank', active: true })).id;
            } else if (tab.active) await chrome.tabs.update(coverId, { active: true });
          }
          const snapshots = tab ? await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const groups = new Map();
              for (const editor of document.querySelectorAll('[data-testid]')) {
                const testId = editor.getAttribute('data-testid');
                if (!/^tweetTextarea_\d+$/.test(testId ?? '')) continue;
                const root = editor.closest('[role="dialog"]') ?? editor.closest('main') ?? document.body;
                if (!groups.has(root)) groups.set(root, []);
                groups.get(root).push({ testId, text: editor.innerText ?? '' });
              }
              return { hidden: document.hidden, visibility: document.visibilityState, groups: [...groups.values()] };
            },
          }).catch(() => []) : [];
          return {
            coverId, tabIds: tabs.map(tab => tab.id), tabId: tab?.id, ...snapshots[0]?.result,
            state: (await chrome.runtime.sendMessage({ type: 'GET_BG_STATE' }))?.postingState,
          };
        }, { initialIds: initial.tabs, coverId, hideAt: values['hide-at'], firstChunk: draft.chunks[0] }), 12_000, 'native hidden X observation');
        coverId = sample.coverId;
        if (coverId) ownedTabs.add(coverId);
        sample.tabIds.forEach(id => ownedTabs.add(id));
        state = sample.state;
        const completeThread = sample.groups?.some(group => matchesPreviewThread(group, draft.chunks)) === true;
        last = { tabId: sample.tabId, hidden: sample.hidden, visibility: sample.visibility, completeThread, groups: sample.groups };
        if (last.hidden) hiddenSamples++;
        if (last.hidden && completeThread) completeHiddenSamples++;
        if (last.hidden && !completeThread) hiddenWhileBuildingSamples++;
        if (state?.requestId === requestId && state.done) break;
        await new Promise(resolveDelay => setTimeout(resolveDelay, 250));
      }
    } catch (cause) {
      error = String(cause);
    }
    const after = await popup.evaluate(async () => JSON.stringify((await chrome.storage.local.get('postHistory')).postHistory ?? []));
    const result = state?.requestId === requestId ? state.results?.find(item => item.platform === 'x') : undefined;
    const ok = !error && state?.done && result?.success && result.preview === true &&
      result.flow?.submitReached === false && !result.url && before === after &&
      hiddenWhileBuildingSamples > 0 && completeHiddenSamples > 0 && last?.hidden && last.completeThread;
    report.iterations.push({ iteration, ok: Boolean(ok), requestId, result, historyUnchanged: before === after,
      hiddenSamples, hiddenWhileBuildingSamples, completeHiddenSamples, last, ...(error ? { error } : {}) });
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ iteration, ok: Boolean(ok), result, hiddenSamples, completeHiddenSamples, historyUnchanged: before === after }));
    await popup.evaluate(async ids => {
      for (const id of ids) await chrome.tabs.remove(id).catch(() => {});
    }, [...ownedTabs]);
    if (!state?.done) break; // Do not overlap a timed-out request with a new one.
  }
} finally {
  await popup?.close().catch(() => {});
  await browser.disconnect();
}
process.exitCode = report.iterations.length === repeat && report.iterations.every(item => item.ok) ? 0 : 1;
