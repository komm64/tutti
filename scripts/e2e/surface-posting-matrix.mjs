/**
 * Surface real-browser posting matrix.
 *
 * This attaches to the Surface browser session with Tutti loaded, opens the
 * extension popup context, and sends POST_REQUEST messages for the common draft
 * shapes. Default mode is preview: it must not click SNS post buttons, must not
 * return URLs, and must not write post history.
 *
 * Usage:
 *   $env:E2E_CDP = 'http://127.0.0.1:9223'
 *   $env:E2E_EXTENSION_ID = '<loaded-extension-id>' # optional if detectable
 *   node scripts/e2e/surface-posting-matrix.mjs --mode preview
 *
 *   node scripts/e2e/surface-posting-matrix.mjs --mode post --cases image-only,text-image --platforms x,bluesky,threads
 *   node scripts/e2e/surface-posting-matrix.mjs --mode preview --repeat 2
 *   node scripts/e2e/surface-posting-matrix.mjs --mode preview --case-timeout-ms 360000
 *
 * Video cases require ffmpeg and ffprobe on the runner so each upload gets a
 * valid, visually unique fixture instead of repeatedly sending identical bytes.
 */

import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  connectPlaywrightCdp,
  disconnectCdp,
  loadE2eFixture,
  resolveCdpEndpoint,
  resolveExtensionId,
  withTemporaryDirectory,
  withTimeout,
} from './cdp-harness.mjs';
import {
  createTimedOutSurfaceSummary,
  formatSurfaceMatrixOutcome,
  validateSurfaceResultContract,
} from './surface-posting-matrix-contract.mjs';

const execFileAsync = promisify(execFile);

const ALL_PLATFORMS = [
  'x',
  'bluesky',
  'threads',
  'mastodon',
  'misskey',
  'tumblr',
  'pixiv',
  'deviantart',
  'instagram',
  'tiktok',
  'youtube',
];

const PLATFORM_KINDS = {
  x: ['text', 'image', 'shortVideo', 'longVideo'],
  bluesky: ['text', 'image', 'shortVideo', 'longVideo'],
  threads: ['text', 'image', 'shortVideo', 'longVideo'],
  mastodon: ['text', 'image', 'shortVideo', 'longVideo'],
  misskey: ['text', 'image', 'shortVideo', 'longVideo'],
  tumblr: ['text', 'image', 'shortVideo', 'longVideo'],
  pixiv: ['image'],
  deviantart: ['image'],
  instagram: ['image', 'shortVideo'],
  tiktok: ['shortVideo'],
  youtube: ['shortVideo'],
};

const PREVIEW_DRAFT_READERS = {
  threads: {
    pageUrl: /^https:\/\/(?:www\.)?threads\.(?:com|net)\//,
    selector:
      '[role="dialog"] div[contenteditable="true"][role="textbox"],' +
      '[role="dialog"] div[contenteditable="plaintext-only"],' +
      '[role="alertdialog"] div[contenteditable="true"][role="textbox"],' +
      '[role="alertdialog"] div[contenteditable="plaintext-only"]',
  },
};

const CASES = {
  'text-only': {
    requires: ['text'],
    text: (stamp) => `tutti surface matrix text ${stamp}`,
    media: 'none',
    verifyPostingWindowPlatform: 'x',
    simulateUserBrowsing: true,
  },
  'text-emoji': {
    requires: ['text'],
    text: (stamp) => `tutti surface matrix emoji ${stamp} 😀 🎮 🧑‍💻 ❤️‍🔥 日本語`,
    media: 'none',
    verifyPreviewDraftText: true,
    verifyPublishedText: true,
  },
  'text-url': {
    requires: ['text'],
    text: (stamp) => (
      `tutti surface matrix URL card ${stamp}\n\n` +
      'This verifies Tumblr body validation after the editor converts a URL into a link preview card.\n\n' +
      'https://tutti.komm64.com/'
    ),
    media: 'none',
  },
  'image-only': {
    requires: ['image'],
    text: () => '',
    media: 'image',
  },
  'text-image': {
    requires: ['image'],
    text: (stamp) => `tutti surface matrix image ${stamp} #tutti`,
    media: 'image',
    verifyPostingWindowPlatform: 'x',
    simulateUserBrowsing: true,
  },
  'hashtags-image': {
    requires: ['image'],
    text: () => '#tutti #test1',
    media: 'image',
  },
  'video-only': {
    requires: ['shortVideo'],
    text: () => '',
    media: 'video',
  },
  'text-video': {
    requires: ['shortVideo'],
    text: (stamp) => `tutti surface matrix video ${stamp}`,
    media: 'video',
    verifyPublishedMedia: true,
  },
  'image-video': {
    requires: ['shortVideo'],
    text: (stamp) => `tutti surface matrix mixed media ${stamp}`,
    media: 'mixed',
  },
  'long-text-image': {
    requires: ['image'],
    text: (stamp) => (
      `tutti surface matrix long text ${stamp} ` +
      'This draft is intentionally long enough to exercise platform splitting and immediate follow-up posting. '.repeat(8) +
      '#tutti'
    ),
    media: 'image',
  },
  'long-text-video': {
    requires: ['shortVideo'],
    text: (stamp) => (
      `tutti surface matrix X foreground thread ${stamp} ` +
      'This draft verifies that a multi-chunk X video post starts in a foreground posting window and resumes after one focus interruption. '.repeat(2) +
      '#tutti'
    ),
    media: 'video',
    verifyPublishedMedia: true,
    verifyPostingWindowPlatform: 'x',
    postingWindowFocusPolicy: 'foreground-video',
  },
};

const UNSUPPORTED_CASES = {
  pixiv: ['image-only'],
};

const args = process.argv.slice(2);
const positional = positionalArgs(args, [
  '--mode',
  '--platforms',
  '--cases',
  '--repeat',
  '--case-timeout-ms',
  '--summary-json',
]);
const mode = argValue('--mode') ?? positional[0] ?? 'preview';
if (!['preview', 'post'].includes(mode)) {
  console.error(`[matrix] invalid --mode: ${mode}`);
  process.exit(2);
}
const autoPost = mode === 'post';
const requestedPlatforms = splitArg('--platforms') ?? ALL_PLATFORMS;
const requestedCases = splitArg('--cases') ?? Object.keys(CASES);
const repeat = Number(argValue('--repeat') ?? positional[1] ?? '1');
if (!Number.isInteger(repeat) || repeat < 1) {
  console.error(`[matrix] invalid --repeat: ${argValue('--repeat')}`);
  process.exit(2);
}
const caseTimeoutMs = Number(argValue('--case-timeout-ms') ?? '360000');
if (!Number.isInteger(caseTimeoutMs) || caseTimeoutMs < 10_000) {
  console.error(`[matrix] invalid --case-timeout-ms: ${argValue('--case-timeout-ms')}`);
  process.exit(2);
}
const skipExtensionReload = args.includes('--skip-extension-reload');
const debugBgStateOnTimeout = args.includes('--debug-bg-state-on-timeout');

const cdp = resolveCdpEndpoint({ fallback: 'http://127.0.0.1:9223' });
const imagePath = resolve(process.env.IMAGE_PATH ?? 'scripts/e2e/fixtures/test-image.png');
const videoPath = resolve(process.env.VIDEO_PATH ?? 'scripts/e2e/fixtures/test-video.mp4');
const summaryPath = resolve(argValue('--summary-json') ?? '.tmp/surface-posting-matrix-last.json');

console.log(`[matrix] mode=${mode} repeat=${repeat}`);
console.log(`[matrix] cdp=${cdp}`);
console.log(`[matrix] platforms=${requestedPlatforms.join(',')}`);
console.log(`[matrix] cases=${requestedCases.join(',')}`);
console.log(`[matrix] caseTimeoutMs=${caseTimeoutMs}`);
console.log(`[matrix] summaryJson=${summaryPath}`);
if (debugBgStateOnTimeout) console.log('[matrix] debugBgStateOnTimeout=true');

for (const platform of requestedPlatforms) {
  if (!ALL_PLATFORMS.includes(platform)) {
    console.error(`[matrix] unknown platform: ${platform}`);
    process.exit(2);
  }
}
for (const caseName of requestedCases) {
  if (!CASES[caseName]) {
    console.error(`[matrix] unknown case: ${caseName}`);
    process.exit(2);
  }
}

const [imageFixture, videoFixture] = await Promise.all([
  readImageFixture(imagePath),
  readVideoFixture(videoPath),
]);

const browser = await connectPlaywrightCdp({ chromium, endpoint: cdp });
const ctx = browser.contexts()[0];
if (!ctx) throw new Error('no browser context');
attachDialogHandlers(ctx);
if (process.env.E2E_TRACE_CONSOLE === '1') attachConsoleHandlers(ctx);

const extensionId = await resolveExtensionId(ctx);
if (!skipExtensionReload) {
  await reloadExtension(ctx, extensionId);
  console.log('[matrix] extension reloaded');
}
await wakeServiceWorker(ctx, extensionId);
await closeNonExtensionPages(ctx, extensionId);
console.log(`[matrix] extension=${extensionId}`);

let popup = await openPopupPage(ctx, extensionId);
const version = await popup.evaluate(() => chrome.runtime.getManifest().version);
const postingAlgorithm = await popup.evaluate(async () => {
  const settings = (await chrome.storage.sync.get('settings'))['settings'] ?? {};
  if (settings.postingAlgorithm === 'legacy') return 'legacy';
  if (settings.postingAlgorithm === 'next') return 'next';
  return settings.xThreadPostingMode === 'sequential' ? 'legacy' : 'next';
});
console.log(`[matrix] extension version=${version}`);
console.log(`[matrix] postingAlgorithm=${postingAlgorithm}`);

const expectedImplementationPath = () => postingAlgorithm;

const failures = [];
const summary = [];
const persistSummary = async () => {
  await writeSummary(summaryPath, {
    mode,
    version,
    postingAlgorithm,
    platforms: requestedPlatforms,
    cases: requestedCases,
    repeat,
    failures,
    summary,
    generatedAt: new Date().toISOString(),
  });
};

for (const caseName of requestedCases) {
  const caseDef = CASES[caseName];
  const platforms = requestedPlatforms.filter((platform) => supportsCase(platform, caseDef));
  const skipped = requestedPlatforms.filter((platform) => !supportsCase(platform, caseDef));
  if (skipped.length > 0) {
    console.log(`[matrix] ${caseName}: skipped unsupported platforms=${skipped.join(',')}`);
  }
  if (platforms.length === 0) {
    summary.push({
      caseName,
      platforms: [],
      skipped: true,
      reason: 'no supported target platforms in this run',
    });
    await persistSummary();
    continue;
  }

  for (let i = 1; i <= repeat; i += 1) {
    const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${caseName}-${i}`;
    const text = caseDef.text(stamp);
    const images = await buildMedia(caseDef.media, imageFixture, videoFixture, stamp);
    popup = await ensurePopupPage(ctx, extensionId, popup);
    await closeNonExtensionPages(ctx, extensionId);
    let beforeHistory;
    try {
      beforeHistory = await readHistory(popup);
    } catch {
      popup = await openPopupPage(ctx, extensionId);
      beforeHistory = await readHistory(popup);
    }
    const startedAt = Date.now();
    const publishedTextEvidence = {};
    const publishedMediaEvidence = {};
    let postingWindowEvidence;
    let postingWindowProbe;
    let browsingTabId;
    console.log(`[matrix] run case=${caseName} iteration=${i}/${repeat} platforms=${platforms.join(',')}`);

    let response;
    try {
      const postingWindowPlatform = autoPost &&
        platforms.includes(caseDef.verifyPostingWindowPlatform)
        ? caseDef.verifyPostingWindowPlatform
        : undefined;
      const initialWindowIds = postingWindowPlatform
        ? await readBrowserWindowIds(popup)
        : undefined;
      const initialFocusedWindowId = postingWindowPlatform
        ? await readFocusedBrowserWindowId(popup)
        : undefined;
      let requestSettled = false;
      const requestPromise = sendPostRequest(popup, {
        type: 'POST_REQUEST',
        requestId: crypto.randomUUID(),
        intent: 'new',
        text,
        platforms,
        images,
        autoPost,
      }).finally(() => {
        requestSettled = true;
      });
      if (postingWindowPlatform) {
        postingWindowProbe = caseDef.postingWindowFocusPolicy === 'foreground-video'
          ? observeForegroundVideoPostingWindow(
              popup,
              initialWindowIds ?? [],
              initialFocusedWindowId,
              postingWindowPlatform,
              () => requestSettled,
              { timeoutMs: caseTimeoutMs },
            )
          : observePostingWindow(
              popup,
              initialWindowIds ?? [],
              postingWindowPlatform,
              () => requestSettled,
              {
                simulateUserBrowsing: caseDef.simulateUserBrowsing === true,
                timeoutMs: caseTimeoutMs,
              },
            );
      }
      response = await withTimeout(
        requestPromise,
        caseTimeoutMs,
        `${caseName}/${platforms.join(',')}`,
      );
      postingWindowEvidence = await postingWindowProbe;
      browsingTabId = postingWindowEvidence?.browsingTabId;
      await closeBrowserTab(popup, browsingTabId);
    } catch (err) {
      postingWindowEvidence = await postingWindowProbe?.catch((probeErr) => ({
        ok: false,
        error: probeErr instanceof Error ? probeErr.message : String(probeErr),
      }));
      browsingTabId = postingWindowEvidence?.browsingTabId;
      await closeBrowserTab(popup, browsingTabId);
      const message = err instanceof Error ? err.message : String(err);
      const backgroundState = await readBackgroundState(popup)
        .then(compactBackgroundState)
        .catch((stateErr) => ({
          error: stateErr instanceof Error ? stateErr.message : String(stateErr),
        }));
      if (debugBgStateOnTimeout) {
        console.log(`[matrix] bg-state-on-timeout ${caseName}: ${JSON.stringify(backgroundState)}`);
      }
      const recoveredResults = backgroundState?.postingState?.results ?? [];
      for (const result of recoveredResults) {
        failures.push(...validateSurfaceResultContract({
          mode,
          caseName,
          platform: result.platform,
          result,
          expectedImplementationPath: expectedImplementationPath(result.platform),
        }));
      }
      failures.push(`${caseName}: ${message}`);
      const timedOutSummary = createTimedOutSurfaceSummary({
        caseName,
        iteration: i,
        platforms,
        error: message,
        backgroundState,
      });
      summary.push({
        ...timedOutSummary,
        ...(postingWindowEvidence ? { postingWindowEvidence } : {}),
      });
      await persistSummary();
      await reloadExtension(ctx, extensionId).catch(() => {});
      await closeNonExtensionPages(ctx, extensionId).catch(() => {});
      popup = await openPopupPage(ctx, extensionId).catch(() => popup);
      continue;
    }
    const results = response?.response?.results ?? [];
    console.log(`[matrix] response case=${caseName}: ${JSON.stringify(results.map(compactResult))}`);

    if (response?.lastError) {
      failures.push(`${caseName}: runtime lastError: ${response.lastError}`);
    }
    if (response?.response?.error) {
      failures.push(`${caseName}: background error: ${response.response.error}`);
    }
    if (!Array.isArray(results)) {
      failures.push(`${caseName}: response did not contain results`);
      continue;
    }
    if (postingWindowEvidence && !postingWindowEvidence.ok) {
      failures.push(
        `${caseName}/${caseDef.verifyPostingWindowPlatform}: ` +
        'active visible compose tab was not observed in a new posting window ' +
        `(${postingWindowEvidence.error ?? JSON.stringify(postingWindowEvidence.candidates ?? [])})`,
      );
    }

    const byPlatform = new Map(results.map((result) => [result.platform, result]));
    for (const platform of platforms) {
      const result = byPlatform.get(platform);
      failures.push(...validateSurfaceResultContract({
        mode,
        caseName,
        platform,
        result,
        expectedImplementationPath: expectedImplementationPath(platform),
      }));
      if (!result?.success) continue;
      if (mode === 'preview') {
        if (caseDef.verifyPreviewDraftText && PREVIEW_DRAFT_READERS[platform]) {
          const draft = await waitForPreviewDraftText(ctx, platform, text);
          if (!draft.found) {
            failures.push(`${caseName}/${platform}: preview draft editor was not found`);
          } else if (draft.text !== text) {
            failures.push(
              `${caseName}/${platform}: preview draft text mismatch ` +
              `(expected=${JSON.stringify(text)}, actual=${JSON.stringify(draft.text)}, ` +
              `candidates=${JSON.stringify(draft.candidates)})`,
            );
          }
        }
      } else {
        const expectedUrls = platform === 'tumblr' ? extractHttpUrls(text) : [];
        if (result.url && expectedUrls.length > 0) {
          const urlCheck = await checkPublishedUrlEvidence(result.url, expectedUrls);
          if (!urlCheck.ok) {
            failures.push(`${caseName}/${platform}: published post missing expected URL(s) ${urlCheck.missing.join(', ')} (${urlCheck.error ?? result.url})`);
          }
        }
        if (result.url && caseDef.verifyPublishedText) {
          const textCheck = await checkPublishedTextEvidence(ctx, result.url, text);
          publishedTextEvidence[platform] = textCheck;
          if (!textCheck.ok) {
            failures.push(
              `${caseName}/${platform}: published post text mismatch ` +
              `(expected=${JSON.stringify(text)}, error=${textCheck.error ?? 'exact text not found'}, url=${result.url})`,
            );
          }
        }
        if (result.url && caseDef.verifyPublishedMedia) {
          const mediaUrl = result.mediaUrl ?? result.url;
          const mediaExpectedText = result.mediaUrl && result.mediaUrl !== result.url
            ? text.slice(0, 120)
            : text;
          const mediaCheck = await checkPublishedMediaEvidence(
            ctx,
            mediaUrl,
            mediaExpectedText,
          );
          publishedMediaEvidence[platform] = mediaCheck;
          if (!mediaCheck.ok) {
            failures.push(
              `${caseName}/${platform}: published video evidence missing ` +
              `(textFound=${mediaCheck.textFound ?? false}, visibleVideoCount=${mediaCheck.visibleVideoCount ?? 0}, ` +
              `error=${mediaCheck.error ?? 'none'}, url=${mediaUrl})`,
            );
          }
        }
      }
    }

    if (mode === 'preview') {
      popup = await ensurePopupPage(ctx, extensionId, popup);
      const afterHistory = await readHistory(popup);
      if (afterHistory.length !== beforeHistory.length) {
        failures.push(`${caseName}: preview changed history (${beforeHistory.length} -> ${afterHistory.length})`);
      }
    } else {
      const entry = await waitForHistoryEntry(popup, { startedAt, platforms });
      if (!entry) {
        failures.push(`${caseName}: post history entry was not written`);
      }
    }

    summary.push({
      caseName,
      iteration: i,
      platforms,
      results: results.map(compactResult),
      ...(Object.keys(publishedTextEvidence).length > 0 ? { publishedTextEvidence } : {}),
      ...(Object.keys(publishedMediaEvidence).length > 0 ? { publishedMediaEvidence } : {}),
      ...(postingWindowEvidence ? { postingWindowEvidence } : {}),
    });
    await persistSummary();
    await closeNonExtensionPages(ctx, extensionId);
  }
}

console.log('\n[matrix] summary');
console.log(JSON.stringify(summary, null, 2));
await persistSummary();

// CDP接続用に起動したSurface Braveで最後のpopupまで閉じると、windowが0枚に
// なってbrowser process自体が終了する。次のmatrixも同じsession/profileで
// 継続できるよう、接続を切る前に通常pageを1枚残す。
const keepalivePage = await ctx.newPage();
await keepalivePage.goto('about:blank', { waitUntil: 'domcontentloaded' });
await popup.close().catch(() => {});
await disconnectCdp(browser, { preserveRemoteBrowser: true });

const outcome = formatSurfaceMatrixOutcome(failures);
for (const line of outcome.stdout) console.log(line);
for (const line of outcome.stderr) console.error(line);
process.exit(outcome.passed ? 0 : outcome.exitCode);

function argValue(name) {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  return args[idx + 1];
}

function positionalArgs(values, optionsWithValues) {
  const optionSet = new Set(optionsWithValues);
  const out = [];
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (optionSet.has(value)) {
      i += 1;
      continue;
    }
    if (value.startsWith('-')) continue;
    out.push(value);
  }
  return out;
}

function splitArg(name) {
  const value = argValue(name);
  if (!value) return undefined;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

async function readPreviewDraftText(ctx, platform) {
  const reader = PREVIEW_DRAFT_READERS[platform];
  if (!reader) return { found: false };
  const candidates = [];
  for (const page of ctx.pages()) {
    if (!reader.pageUrl.test(page.url())) continue;
    const drafts = page.locator(reader.selector);
    const count = await drafts.count();
    for (let i = 0; i < count; i += 1) {
      const draft = drafts.nth(i);
      const domText = await draft.innerText();
      const lexicalText = await draft.evaluate((element) => {
        let current = element;
        let editor = null;
        while (current) {
          if (current.__lexicalEditor) {
            editor = current.__lexicalEditor;
            break;
          }
          current = current.parentElement;
        }
        if (!editor || typeof editor.getEditorState !== 'function') return '';

        const readText = (value) => {
          if (!value || typeof value !== 'object') return '';
          if (typeof value.text === 'string') return value.text;
          return Array.isArray(value.children)
            ? value.children.map(readText).join('')
            : '';
        };
        const state = editor.getEditorState().toJSON();
        return readText(state.root ?? state);
      }).catch(() => '');
      candidates.push({
        text: lexicalText || domText,
        domText,
        lexicalText,
        visible: await draft.isVisible(),
        pageUrl: page.url(),
      });
    }
  }
  if (candidates.length === 0) return { found: false };
  candidates.sort((a, b) => Number(b.visible) - Number(a.visible) || b.text.length - a.text.length);
  return {
    found: true,
    text: candidates[0]?.text ?? '',
    url: candidates[0]?.pageUrl,
    candidates,
  };
}

async function waitForPreviewDraftText(ctx, platform, expectedText, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = { found: false };
  do {
    last = await readPreviewDraftText(ctx, platform);
    const exact = last.candidates?.find((candidate) => candidate.text === expectedText);
    if (exact) {
      return {
        ...last,
        text: exact.text,
        url: exact.pageUrl,
      };
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  } while (Date.now() < deadline);
  return last;
}

function supportsCase(platform, caseDef) {
  const caseName = Object.entries(CASES).find(([, value]) => value === caseDef)?.[0];
  if (caseName && UNSUPPORTED_CASES[platform]?.includes(caseName)) return false;
  const kinds = PLATFORM_KINDS[platform] ?? [];
  return caseDef.requires.every((kind) => kinds.includes(kind));
}

function attachDialogHandlers(ctx) {
  const attached = new WeakSet();
  const attach = (page) => {
    if (!page || attached.has(page)) return;
    attached.add(page);
    page.on('dialog', async (dialog) => {
      try {
        await dialog.dismiss();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[matrix] ignored dialog after page detach: ${message}`);
      }
    });
  };
  for (const page of ctx.pages()) attach(page);
  ctx.on('page', attach);
}

function attachConsoleHandlers(ctx) {
  const attached = new WeakSet();
  const attach = (page) => {
    if (!page || attached.has(page)) return;
    attached.add(page);
    page.on('console', (message) => {
      const value = message.text();
      if (!/\[Tutti(?: inject-helper)?\]/.test(value)) return;
      console.log(`[matrix] page-console ${page.url()} ${message.type()}: ${value}`);
    });
  };
  for (const page of ctx.pages()) attach(page);
  ctx.on('page', attach);
}

async function readImageFixture(path) {
  const type = path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg')
    ? 'image/jpeg'
    : 'image/png';
  return await loadE2eFixture(basename(path), type, {
    root: dirname(path),
    required: true,
  });
}

async function readVideoFixture(path) {
  const fixture = await loadE2eFixture(basename(path), 'video/mp4', {
    root: dirname(path),
    required: true,
  });
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    path,
  ], {
    timeout: 30_000,
    windowsHide: true,
  });
  const durationS = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(durationS) || durationS <= 0) {
    throw new Error(`ffprobe returned an invalid duration for ${path}: ${stdout.trim()}`);
  }
  return {
    ...fixture,
    data: Buffer.from(fixture.data, 'base64'),
    durationS,
    path,
  };
}

async function buildMedia(kind, imageFixture, videoFixture, stamp) {
  if (kind === 'none') return undefined;
  if (kind === 'image') {
    return [{
      ...imageFixture,
      name: uniqueName(imageFixture.name, stamp),
    }];
  }
  if (kind === 'video') {
    // X can strand repeated byte-identical test media in processing even when
    // the filename changes. Re-encode a standards-compliant, visibly unique,
    // audio-free MP4 instead of mutating the container with an appended box.
    const data = await createUniqueVideoVariant(videoFixture.path, stamp);
    return [{
      name: uniqueName(videoFixture.name, stamp),
      type: videoFixture.type,
      data: data.toString('base64'),
      bytes: data.byteLength,
      durationS: videoFixture.durationS,
    }];
  }
  if (kind === 'mixed') {
    const video = await buildMedia('video', imageFixture, videoFixture, stamp);
    return [
      {
        ...imageFixture,
        name: uniqueName(imageFixture.name, stamp),
      },
      ...video,
    ];
  }
  throw new Error(`unknown media kind: ${kind}`);
}

async function createUniqueVideoVariant(sourcePath, stamp) {
  const digest = createHash('sha256').update(stamp).digest();
  const color = digest.subarray(0, 3).toString('hex');
  const x = 12 + digest[3];
  const y = 12 + digest[4] % 120;
  return await withTemporaryDirectory(async (tempDir) => {
    const outputPath = resolve(tempDir, 'tutti-surface-variant.mp4');
    await execFileAsync('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', sourcePath,
      '-map', '0:v:0',
      '-vf', `drawbox=x=${x}:y=${y}:w=16:h=16:color=0x${color}:t=fill`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-profile:v', 'high',
      '-level:v', '3.1',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-an',
      '-movflags', '+faststart',
      '-metadata', `comment=tutti-surface-${stamp}`,
      outputPath,
    ], {
      timeout: 60_000,
      windowsHide: true,
    });
    return await readFile(outputPath);
  }, { prefix: 'tutti-surface-video-' });
}

function uniqueName(name, stamp) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}-${stamp}`;
  return `${name.slice(0, dot)}-${stamp}${name.slice(dot)}`;
}

async function wakeServiceWorker(ctx, extensionId) {
  let sw = ctx.serviceWorkers().find((worker) => worker.url().includes(`chrome-extension://${extensionId}/`));
  if (sw) return sw;
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 50; i += 1) {
    sw = ctx.serviceWorkers().find((worker) => worker.url().includes(`chrome-extension://${extensionId}/`));
    if (sw) break;
    await page.waitForTimeout(100);
  }
  await page.close();
  if (!sw) throw new Error('Tutti service worker not found');
  return sw;
}

async function openPopupPage(ctx, extensionId) {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForTimeout(1000);
  return page;
}

async function closeNonExtensionPages(ctx, extensionId) {
  const extensionPrefix = `chrome-extension://${extensionId}/`;
  const pages = ctx.pages();
  const hasExtensionPage = pages.some((page) => page.url().startsWith(extensionPrefix));
  let keptFallback = false;
  let closed = 0;
  await Promise.all(pages.map(async (page) => {
    const url = page.url();
    if (url.startsWith(extensionPrefix)) return;
    if (!hasExtensionPage && !keptFallback) {
      keptFallback = true;
      return;
    }
    try {
      await page.close({ runBeforeUnload: false });
      closed += 1;
    } catch {
      // Best-effort cleanup only; a detached tab should not fail the matrix.
    }
  }));
  if (closed > 0) console.log(`[matrix] closed ${closed} non-extension tab(s)`);
}

async function ensurePopupPage(ctx, extensionId, page) {
  if (page && !page.isClosed()) return page;
  return await openPopupPage(ctx, extensionId);
}

async function reloadExtension(ctx, extensionId) {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.evaluate(() => chrome.runtime.reload()).catch(() => {});
  await page.close().catch(() => {});
  await new Promise((resolveReload) => setTimeout(resolveReload, 1500));
}

async function sendPostRequest(popup, request) {
  return await popup.evaluate(async (payload) => {
    return await new Promise((resolveResponse) => {
      chrome.runtime.sendMessage(payload, (response) => {
        resolveResponse({
          response,
          lastError: chrome.runtime.lastError?.message,
        });
      });
    });
  }, request);
}

async function readHistory(popup) {
  return await popup.evaluate(async () => {
    return (await chrome.storage.local.get('postHistory'))['postHistory'] ?? [];
  });
}

async function readBackgroundState(popup) {
  return await popup.evaluate(async () => {
    return await chrome.runtime.sendMessage({ type: 'GET_BG_STATE' });
  });
}

async function readBrowserWindowIds(popup) {
  return await popup.evaluate(async () => {
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    return windows
      .map((window) => window.id)
      .filter((id) => typeof id === 'number');
  });
}

async function readFocusedBrowserWindowId(popup) {
  return await popup.evaluate(async () => {
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    return windows.find((window) => window.focused === true)?.id;
  });
}

async function observeForegroundVideoPostingWindow(
  popup,
  initialWindowIds,
  initialFocusedWindowId,
  platform,
  isRequestSettled,
  { timeoutMs = 360_000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  const focusLossHoldMs = 5_000;
  let last;
  let postingWindowId;
  let browsingTab;
  let foregroundObservedAt;
  let focusLostAt;
  let focusRestoredAt;
  let browsingNavigationDone = false;

  do {
    last = await inspectPostingWindow(
      popup,
      initialWindowIds,
      platform,
      browsingTab,
    );
    const candidate = last.candidates.find((item) => item.newWindow) ?? last.candidates[0];
    if (candidate && typeof candidate.windowId === 'number') {
      postingWindowId ??= candidate.windowId;
    }

    const mediaState = candidate?.composeState?.mediaState;
    const mediaStarted = (mediaState?.videoCount ?? 0) > 0 ||
      (mediaState?.progress?.length ?? 0) > 0;
    if (
      !foregroundObservedAt &&
      candidate?.windowFocused === true &&
      candidate.tabActive === true &&
      candidate.visibilityState === 'visible' &&
      candidate.hidden === false &&
      mediaState?.documentHasFocus === true &&
      mediaStarted
    ) {
      foregroundObservedAt = Date.now();
      browsingTab = await openBrowsingTab(popup, initialFocusedWindowId);
      continue;
    }

    if (
      foregroundObservedAt &&
      !focusRestoredAt &&
      candidate?.windowFocused === false &&
      candidate.tabActive === true &&
      candidate.visibilityState === 'visible' &&
      candidate.hidden === false &&
      mediaState?.documentHasFocus === false &&
      last.focusedOriginalWindowId === browsingTab?.windowId &&
      last.browsingTabActive === true
    ) {
      focusLostAt ??= Date.now();
      const focusLossDurationMs = Date.now() - focusLostAt;
      if (!browsingNavigationDone && focusLossDurationMs >= 1_500) {
        browsingTab = await navigateBrowsingTab(popup, browsingTab);
        browsingNavigationDone = true;
      }
      if (focusLossDurationMs >= focusLossHoldMs && typeof postingWindowId === 'number') {
        await focusBrowserWindow(popup, postingWindowId);
      }
    }

    if (
      focusLostAt &&
      !focusRestoredAt &&
      candidate?.windowFocused === true &&
      candidate.tabActive === true &&
      mediaState?.documentHasFocus === true
    ) {
      focusRestoredAt = Date.now();
    }

    if (isRequestSettled()) {
      return {
        ...last,
        ok: Boolean(foregroundObservedAt && focusLostAt && focusRestoredAt),
        focusPolicy: 'foreground-video',
        postingWindowId,
        initialFocusedWindowId,
        foregroundObservedAt,
        focusLostAt,
        focusRestoredAt,
        focusLossDurationMs: focusLostAt
          ? (focusRestoredAt ?? Date.now()) - focusLostAt
          : 0,
        browsingTabId: browsingTab?.tabId,
        browsingWindowId: browsingTab?.windowId,
        mediaState: candidate?.composeState?.mediaState,
      };
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  } while (Date.now() < deadline);

  return {
    ...last,
    ok: false,
    focusPolicy: 'foreground-video',
    postingWindowId,
    initialFocusedWindowId,
    foregroundObservedAt,
    focusLostAt,
    focusRestoredAt,
    focusLossDurationMs: focusLostAt
      ? (focusRestoredAt ?? Date.now()) - focusLostAt
      : 0,
    browsingTabId: browsingTab?.tabId,
    browsingWindowId: browsingTab?.windowId,
    error: `foreground video posting observation timed out after ${timeoutMs}ms`,
  };
}

async function focusBrowserWindow(popup, windowId) {
  await popup.evaluate(async (targetWindowId) => {
    await chrome.windows.update(targetWindowId, { focused: true });
  }, windowId);
}

async function observePostingWindow(
  popup,
  initialWindowIds,
  platform,
  isRequestSettled,
  {
    simulateUserBrowsing = false,
    timeoutMs = 60_000,
  } = {},
) {
  const deadline = Date.now() + timeoutMs;
  const browsingStartedAt = Date.now();
  const requiredBrowsingSamples = 12;
  const allowedMediaFocusLeaseMs = 1_500;
  let browsingTab;
  let browsingNavigationDone = false;
  let browsingSamples = 0;
  let mediaFocusLeaseStartedAt;
  let mediaFocusLeaseSamples = 0;
  let maxMediaFocusLeaseMs = 0;
  let invalidBrowsingSample;
  let last = {
    ok: false,
    platform,
    initialWindowIds,
    candidates: [],
  };
  do {
    if (isRequestSettled()) {
      if (!simulateUserBrowsing) return last;
      if (typeof mediaFocusLeaseStartedAt === 'number') {
        maxMediaFocusLeaseMs = Math.max(
          maxMediaFocusLeaseMs,
          Date.now() - mediaFocusLeaseStartedAt,
        );
      }
      return {
        ...last,
        ok: Boolean(
          browsingTab &&
          browsingSamples >= requiredBrowsingSamples &&
          last.originalWindowStillFocused === true &&
          maxMediaFocusLeaseMs <= allowedMediaFocusLeaseMs &&
          !invalidBrowsingSample
        ),
        simulatedUserBrowsing: true,
        browsingTabId: browsingTab?.tabId,
        browsingWindowId: browsingTab?.windowId,
        browsingSamples,
        browsingDurationMs: browsingTab
          ? Date.now() - browsingStartedAt
          : 0,
        allowedMediaFocusLeaseMs,
        mediaFocusLeaseSamples,
        maxMediaFocusLeaseMs,
        ...(invalidBrowsingSample ? { invalidBrowsingSample } : {}),
      };
    }

    last = await inspectPostingWindow(
      popup,
      initialWindowIds,
      platform,
      browsingTab,
    );
    if (!simulateUserBrowsing && last.ok) return last;

    if (simulateUserBrowsing && !browsingTab && last.ok) {
      browsingTab = await openBrowsingTab(
        popup,
        last.focusedOriginalWindowId,
      );
      browsingSamples = 0;
      continue;
    }
    if (simulateUserBrowsing && browsingTab) {
      const postingTabActiveAndVisible = last.candidates.some((candidate) => (
        candidate.newWindow &&
        candidate.tabActive === true &&
        candidate.visibilityState === 'visible' &&
        candidate.hidden === false
      ));
      const originalWindowFocused =
        last.browsingTabActive === true &&
        last.focusedOriginalWindowId === browsingTab.windowId;
      const mediaFocusLeaseObserved =
        postingTabActiveAndVisible &&
        last.browsingTabActive === true &&
        last.candidates.some((candidate) => candidate.windowFocused === true);
      const ownedPostingTabClosedDuringInspection = last.candidates.some((candidate) => (
        candidate.newWindow &&
        /No tab with id|tab (?:was|is) closed/i.test(candidate.inspectError ?? '')
      ));
      if (postingTabActiveAndVisible && originalWindowFocused) {
        if (typeof mediaFocusLeaseStartedAt === 'number') {
          maxMediaFocusLeaseMs = Math.max(
            maxMediaFocusLeaseMs,
            Date.now() - mediaFocusLeaseStartedAt,
          );
          mediaFocusLeaseStartedAt = undefined;
        }
        browsingSamples += 1;
      } else if (mediaFocusLeaseObserved) {
        mediaFocusLeaseStartedAt ??= Date.now();
        mediaFocusLeaseSamples += 1;
        const leaseDurationMs = Date.now() - mediaFocusLeaseStartedAt;
        maxMediaFocusLeaseMs = Math.max(maxMediaFocusLeaseMs, leaseDurationMs);
        if (leaseDurationMs > allowedMediaFocusLeaseMs && !invalidBrowsingSample) {
          invalidBrowsingSample = {
            reason: 'posting-window-focus-lease-exceeded',
            leaseDurationMs,
            originalWindowStillFocused: last.originalWindowStillFocused,
            focusedOriginalWindowId: last.focusedOriginalWindowId,
            browsingTabActive: last.browsingTabActive,
            candidates: last.candidates,
          };
        }
      } else if (
        last.candidates.length > 0 &&
        !ownedPostingTabClosedDuringInspection &&
        !invalidBrowsingSample
      ) {
        invalidBrowsingSample = {
          reason: 'browsing-or-posting-tab-lost',
          originalWindowStillFocused: last.originalWindowStillFocused,
          focusedOriginalWindowId: last.focusedOriginalWindowId,
          browsingTabActive: last.browsingTabActive,
          candidates: last.candidates,
        };
      }
      if (
        !browsingNavigationDone &&
        Date.now() - browsingStartedAt >= 1_500
      ) {
        browsingTab = await navigateBrowsingTab(popup, browsingTab);
        browsingNavigationDone = true;
      }
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  } while (Date.now() < deadline);
  return {
    ...last,
    ok: false,
    simulatedUserBrowsing: simulateUserBrowsing,
    browsingTabId: browsingTab?.tabId,
    browsingWindowId: browsingTab?.windowId,
    browsingSamples,
    allowedMediaFocusLeaseMs,
    mediaFocusLeaseSamples,
    maxMediaFocusLeaseMs,
    ...(invalidBrowsingSample ? { invalidBrowsingSample } : {}),
    error: `posting window observation timed out after ${timeoutMs}ms`,
  };
}

async function inspectPostingWindow(
  popup,
  initialWindowIds,
  platform,
  browsingTab,
) {
  return await popup.evaluate(async ({ baseline, targetPlatform, browsing }) => {
    const initial = new Set(baseline);
    const windows = await chrome.windows.getAll({
      populate: true,
      windowTypes: ['normal'],
    });
    const matchesPlatform = (value) => {
      try {
        const url = new URL(value);
        if (targetPlatform === 'x') {
          return ['x.com', 'twitter.com'].includes(url.hostname);
        }
        return false;
      } catch {
        return false;
      }
    };
    const candidates = [];
    for (const window of windows) {
      for (const tab of window.tabs ?? []) {
        const tabUrl = tab.url ?? tab.pendingUrl ?? '';
        if (typeof tab.id !== 'number' || !matchesPlatform(tabUrl)) continue;
        let visibilityState;
        let hidden;
        let inspectError;
        let composeState;
        try {
          const injected = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
           func: () => ({
              visibilityState: document.visibilityState,
              hidden: document.hidden,
              textareas: Array.from(
                document.querySelectorAll('[data-testid^="tweetTextarea_"]'),
              ).filter((element) => (
                /^tweetTextarea_\d+$/.test(element.getAttribute('data-testid') ?? '')
              )).map((element) => ({
                testId: element.getAttribute('data-testid'),
                textLength: (element.textContent ?? '').trim().length,
                contentEditable: element.getAttribute('contenteditable'),
              })),
              postButtons: Array.from(document.querySelectorAll(
                '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]',
              )).map((element) => ({
                testId: element.getAttribute('data-testid'),
                ariaDisabled: element.getAttribute('aria-disabled'),
                disabled: element.disabled === true,
                rect: {
                  width: Math.round(element.getBoundingClientRect().width),
                  height: Math.round(element.getBoundingClientRect().height),
                },
              })),
              mediaState: {
                documentHasFocus: document.hasFocus(),
                videoCount: document.querySelectorAll('video').length,
                progress: Array.from(document.querySelectorAll(
                  '[role="progressbar"], progress',
                )).slice(0, 10).map((element) => ({
                  ariaValueNow: element.getAttribute('aria-valuenow'),
                  ariaValueText: element.getAttribute('aria-valuetext'),
                  text: (element.textContent ?? '').trim().slice(0, 120),
                })),
                alerts: Array.from(document.querySelectorAll(
                  '[role="alert"], [aria-live="assertive"]',
                )).slice(0, 10).map((element) => (
                  (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
                )).filter(Boolean),
              },
            }),
          });
          visibilityState = injected[0]?.result?.visibilityState;
          hidden = injected[0]?.result?.hidden;
          composeState = {
            textareas: injected[0]?.result?.textareas,
            postButtons: injected[0]?.result?.postButtons,
            mediaState: injected[0]?.result?.mediaState,
          };
        } catch (err) {
          inspectError = err instanceof Error ? err.message : String(err);
        }
        candidates.push({
          windowId: window.id,
          newWindow: typeof window.id === 'number' && !initial.has(window.id),
          windowFocused: window.focused,
          tabId: tab.id,
          tabActive: tab.active,
          visibilityState,
          hidden,
          inspectError,
          composeState,
          composeRoute: /\/compose\/post(?:[/?#]|$)/.test(tabUrl),
        });
      }
    }
    const focusedOriginalWindow = windows.find((window) => (
      typeof window.id === 'number' &&
      initial.has(window.id) &&
      window.focused === true
    ));
    const browsingChromeTab = typeof browsing?.tabId === 'number'
      ? windows
        .flatMap((window) => window.tabs ?? [])
        .find((tab) => tab.id === browsing.tabId)
      : undefined;
    return {
      ok: candidates.some((candidate) => (
        candidate.newWindow &&
        candidate.windowFocused === false &&
        candidate.tabActive === true &&
        candidate.visibilityState === 'visible' &&
        candidate.hidden === false
      )) && windows.some((window) => (
        typeof window.id === 'number' &&
        initial.has(window.id) &&
        window.focused === true
      )),
      platform: targetPlatform,
      initialWindowIds: baseline,
      originalWindowStillFocused: windows.some((window) => (
        typeof window.id === 'number' &&
        initial.has(window.id) &&
        window.focused === true
      )),
      focusedOriginalWindowId: focusedOriginalWindow?.id,
      browsingTabActive: browsingChromeTab?.active,
      candidates,
    };
  }, {
    baseline: initialWindowIds,
    targetPlatform: platform,
    browsing: browsingTab,
  });
}

async function openBrowsingTab(popup, windowId) {
  if (typeof windowId !== 'number') {
    throw new Error('focused original window was not found for browsing simulation');
  }
  return await popup.evaluate(async (targetWindowId) => {
    const tab = await chrome.tabs.create({
      windowId: targetWindowId,
      url: 'about:blank#tutti-surface-browsing-1',
      active: true,
    });
    await chrome.windows.update(targetWindowId, { focused: true });
    if (typeof tab.id !== 'number') {
      throw new Error('browsing simulation tab did not receive an id');
    }
    return {
      tabId: tab.id,
      windowId: targetWindowId,
    };
  }, windowId);
}

async function navigateBrowsingTab(popup, browsingTab) {
  return await popup.evaluate(async ({ tabId, windowId }) => {
    // Brave 151 on Surface CHECK-crashes in the browser main thread when
    // chrome.tabs.update performs an about:blank same-document hash change.
    // Replacing the tab exercises continued browsing/focus without that
    // browser bug or an external site such as example.org.
    const replacement = await chrome.tabs.create({
      windowId,
      url: 'about:blank#tutti-surface-browsing-2',
      active: true,
    });
    if (typeof replacement.id !== 'number') {
      throw new Error('replacement browsing tab did not receive an id');
    }
    await chrome.tabs.remove(tabId);
    return {
      tabId: replacement.id,
      windowId,
    };
  }, browsingTab);
}

async function closeBrowserTab(popup, tabId) {
  if (typeof tabId !== 'number') return;
  await popup.evaluate(async (targetTabId) => {
    await chrome.tabs.remove(targetTabId).catch(() => {});
  }, tabId).catch(() => {});
}

function compactBackgroundState(state) {
  const postingState = state?.postingState;
  if (!postingState) {
    return {
      posting: state?.posting,
      postingState: null,
    };
  }
  return {
    posting: state?.posting,
    postingState: {
      platforms: postingState.platforms,
      pending: postingState.pending,
      done: postingState.done,
      results: Array.isArray(postingState.results)
        ? postingState.results.map(compactResult)
        : [],
    },
  };
}

async function waitForHistoryEntry(popup, { startedAt, platforms }) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const history = await readHistory(popup);
    const entry = history.find((item) => {
      if (!item || item.timestamp < startedAt) return false;
      return platforms.every((platform) => item.platforms?.includes(platform));
    });
    if (entry) return entry;
    await popup.waitForTimeout(1000);
  }
  return null;
}

function compactResult(result) {
  return {
    platform: result.platform,
    success: result.success,
    preview: result.preview,
    confirmed: result.confirmed,
    uncertain: result.uncertain,
    implementation: result.implementation,
    userAction: result.userAction,
    flow: result.flow,
    url: result.url,
    mediaUrl: result.mediaUrl,
    error: result.error,
    verify: result.verify,
  };
}

async function writeSummary(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
}

function extractHttpUrls(value) {
  const urls = [];
  const seen = new Set();
  for (const match of value.matchAll(/\bhttps?:\/\/[^\s<>"'`]+/gi)) {
    const url = trimUrlPunctuation(match[0] ?? '');
    if (!url) continue;
    const key = normalizeComparableUrl(url);
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
  }
  return urls;
}

async function checkPublishedUrlEvidence(postUrl, expectedUrls) {
  try {
    const res = await fetch(postUrl, { redirect: 'follow' });
    if (!res.ok) {
      return { ok: false, missing: expectedUrls, error: `HTTP ${res.status}` };
    }
    const html = decodeHtmlEntities(await res.text());
    const urls = extractHttpUrls(html);
    const missing = expectedUrls.filter((url) => !hasUrlEvidence(url, { text: html, urls }));
    return { ok: missing.length === 0, missing };
  } catch (err) {
    return {
      ok: false,
      missing: expectedUrls,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkPublishedTextEvidence(ctx, postUrl, expectedText) {
  const page = await ctx.newPage();
  try {
    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const deadline = Date.now() + 60_000;
    let bodyText = '';
    while (Date.now() < deadline) {
      bodyText = await page.locator('body').innerText().catch(() => '');
      if (bodyText.includes(expectedText)) {
        return {
          ok: true,
          url: page.url(),
          expectedText,
        };
      }
      await page.waitForTimeout(2_000);
    }
    return {
      ok: false,
      url: page.url(),
      expectedText,
      replacementCharacterFound: bodyText.includes('\uFFFD'),
      error: 'exact text not found within 60 seconds',
    };
  } catch (err) {
    return {
      ok: false,
      url: page.url() || postUrl,
      expectedText,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function checkPublishedMediaEvidence(ctx, postUrl, expectedText) {
  const page = await ctx.newPage();
  try {
    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const deadline = Date.now() + 60_000;
    let textFound = false;
    let visibleVideoCount = 0;
    while (Date.now() < deadline) {
      const bodyText = await page.locator('body').innerText().catch(() => '');
      textFound = bodyText.includes(expectedText);
      const videos = page.locator('video');
      const count = await videos.count();
      visibleVideoCount = 0;
      for (let i = 0; i < count; i += 1) {
        if (await videos.nth(i).isVisible().catch(() => false)) visibleVideoCount += 1;
      }
      if (textFound && visibleVideoCount > 0) {
        return {
          ok: true,
          url: page.url(),
          expectedText,
          textFound,
          visibleVideoCount,
        };
      }
      await page.waitForTimeout(2_000);
    }
    return {
      ok: false,
      url: page.url(),
      expectedText,
      textFound,
      visibleVideoCount,
      error: 'expected text and visible video were not both found within 60 seconds',
    };
  } catch (err) {
    return {
      ok: false,
      url: page.url() || postUrl,
      expectedText,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function hasUrlEvidence(expectedUrl, found) {
  const expected = trimUrlPunctuation(expectedUrl);
  if (!expected) return true;
  const comparable = normalizeComparableUrl(expected);
  const withoutProtocol = comparable.replace(/^https?:\/\//, '');
  const host = urlHost(expected);
  const path = urlPath(expected);
  const text = (found.text ?? '').toLowerCase();
  if (text.includes(expected.toLowerCase())) return true;
  if (text.includes(withoutProtocol)) return true;
  for (const url of found.urls ?? []) {
    if (normalizeComparableUrl(url) === comparable) return true;
    if (host && urlHost(url) === host) {
      if (!path || path === '/' || urlPath(url).startsWith(path)) return true;
    }
  }
  return false;
}

function normalizeComparableUrl(value) {
  const trimmed = trimUrlPunctuation(value);
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
}

function trimUrlPunctuation(value) {
  return value.trim().replace(/[),.;!?]+$/g, '');
}

function urlHost(value) {
  try {
    return new URL(withUrlProtocol(value)).host.toLowerCase();
  } catch {
    return undefined;
  }
}

function urlPath(value) {
  try {
    return new URL(withUrlProtocol(value)).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '';
  }
}

function withUrlProtocol(value) {
  const trimmed = trimUrlPunctuation(value);
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}
