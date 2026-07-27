import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_CDP_ENDPOINT = 'http://127.0.0.1:9222';
export const DEFAULT_CDP_TIMEOUT_MS = 120_000;
export const DEFAULT_EXTENSION_DISCOVERY_TIMEOUT_MS = 10_000;
export const E2E_FIXTURE_ROOT = resolve(moduleDir, 'fixtures');

export function resolveCdpEndpoint({
  env = process.env,
  fallback = DEFAULT_CDP_ENDPOINT,
  required = false,
} = {}) {
  const endpoint = env.E2E_CDP_WS?.trim() || env.E2E_CDP?.trim() || fallback?.trim();
  if (!endpoint && required) {
    throw new Error('E2E_CDP or E2E_CDP_WS is required');
  }
  return endpoint || undefined;
}

export async function connectPlaywrightCdp({
  chromium: chromiumApi,
  endpoint = resolveCdpEndpoint(),
  timeoutMs = DEFAULT_CDP_TIMEOUT_MS,
} = {}) {
  if (!endpoint) throw new Error('CDP endpoint is required');
  const driver = chromiumApi ?? (await import('playwright')).chromium;
  return await driver.connectOverCDP(endpoint, { timeout: timeoutMs });
}

export async function connectPuppeteerCdp({
  puppeteer: puppeteerApi,
  endpoint = resolveCdpEndpoint(),
  timeoutMs = DEFAULT_CDP_TIMEOUT_MS,
  defaultViewport = null,
} = {}) {
  if (!endpoint) throw new Error('CDP endpoint is required');
  const driver = puppeteerApi ?? (await import('puppeteer-core')).default;
  const endpointOption = endpoint.startsWith('ws:')
    ? { browserWSEndpoint: endpoint }
    : { browserURL: endpoint };
  return await driver.connect({
    ...endpointOption,
    defaultViewport,
    protocolTimeout: timeoutMs,
  });
}

export async function disconnectCdp(browser) {
  if (!browser) return;
  if (typeof browser.disconnect === 'function') {
    await browser.disconnect();
    return;
  }
  if (typeof browser.close === 'function') {
    await browser.close();
  }
}

export async function withCdpBrowser(connect, run) {
  const browser = await connect();
  try {
    return await run(browser);
  } finally {
    await disconnectCdp(browser);
  }
}

export async function resolveExtensionId(
  subject,
  {
    env = process.env,
    timeoutMs = DEFAULT_EXTENSION_DISCOVERY_TIMEOUT_MS,
    pollIntervalMs = 200,
  } = {},
) {
  const configured = env.E2E_EXTENSION_ID?.trim();
  if (configured) return configured;

  const deadline = Date.now() + timeoutMs;
  do {
    const detected = await detectExtensionIdOnce(subject);
    if (detected) return detected;
    if (Date.now() >= deadline) break;
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
  } while (Date.now() <= deadline);

  throw new Error('extension id not detected; set E2E_EXTENSION_ID');
}

export function extensionIdFromUrl(url) {
  const match = String(url ?? '').match(/^chrome-extension:\/\/([a-z]+)\//);
  return match?.[1] ?? null;
}

export async function withTimeout(promise, timeoutMs, label = 'operation') {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`invalid timeout for ${label}: ${timeoutMs}`);
  }

  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${timeoutMs}ms waiting for ${label}`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function resolveFixturePath(filename, { root = E2E_FIXTURE_ROOT } = {}) {
  const fixtureRoot = resolve(root);
  const path = resolve(fixtureRoot, filename);
  const relativePath = relative(fixtureRoot, path);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || resolve(path) === fixtureRoot) {
    throw new Error(`fixture path escapes fixture root: ${filename}`);
  }
  return path;
}

export async function loadE2eFixture(
  filename,
  mimeType,
  { durationS, root = E2E_FIXTURE_ROOT, required = false } = {},
) {
  const path = resolveFixturePath(filename, { root });
  if (!existsSync(path)) {
    if (required) throw new Error(`missing E2E fixture: ${path}`);
    return null;
  }
  const bytes = await readFile(path);
  return {
    name: basename(path),
    type: mimeType,
    data: bytes.toString('base64'),
    bytes: bytes.length,
    ...(durationS !== undefined ? { durationS } : {}),
  };
}

export async function withTemporaryDirectory(
  run,
  {
    prefix = 'tutti-e2e-',
    root = tmpdir(),
    preserve = false,
  } = {},
) {
  const absoluteRoot = resolve(root);
  await mkdir(absoluteRoot, { recursive: true });
  const path = await mkdtemp(resolve(absoluteRoot, prefix));
  try {
    return await run(path);
  } finally {
    if (!preserve) {
      await rm(path, { recursive: true, force: true });
    }
  }
}

async function detectExtensionIdOnce(subject) {
  const candidates = [];

  await appendCollection(candidates, callMaybe(subject, 'serviceWorkers'));
  await appendCollection(candidates, callMaybe(subject, 'pages'));
  await appendCollection(candidates, callMaybe(subject, 'targets'));

  const contexts = await resolveMaybePromise(callMaybe(subject, 'contexts'));
  if (Array.isArray(contexts)) {
    for (const context of contexts) {
      await appendCollection(candidates, callMaybe(context, 'serviceWorkers'));
      await appendCollection(candidates, callMaybe(context, 'pages'));
    }
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const rawUrl = typeof candidate.url === 'function' ? candidate.url() : candidate.url;
    const extensionId = extensionIdFromUrl(rawUrl);
    if (extensionId) return extensionId;
  }
  return null;
}

function callMaybe(subject, method) {
  return typeof subject?.[method] === 'function' ? subject[method]() : [];
}

async function appendCollection(target, collection) {
  const items = await resolveMaybePromise(collection);
  if (Array.isArray(items)) target.push(...items);
}

async function resolveMaybePromise(value) {
  return await value;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
