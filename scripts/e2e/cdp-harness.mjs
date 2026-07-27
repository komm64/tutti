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

export async function connectPuppeteerCdp(options = {}) {
  const {
    puppeteer: puppeteerApi,
    endpoint: configuredEndpoint,
    browserURL,
    browserWSEndpoint,
    timeoutMs: configuredTimeoutMs,
    protocolTimeout,
    defaultViewport = null,
    ...connectOptions
  } = options;
  const endpoint = configuredEndpoint
    ?? browserWSEndpoint
    ?? browserURL
    ?? resolveCdpEndpoint();
  const timeoutMs = configuredTimeoutMs ?? protocolTimeout ?? DEFAULT_CDP_TIMEOUT_MS;
  if (!endpoint) throw new Error('CDP endpoint is required');
  const driver = puppeteerApi ?? (await import('puppeteer-core')).default;
  const endpointOption = endpoint.startsWith('ws:')
    ? { browserWSEndpoint: endpoint }
    : { browserURL: endpoint };
  return await driver.connect({
    ...connectOptions,
    ...endpointOption,
    defaultViewport,
    protocolTimeout: timeoutMs,
  });
}

export function resolveCdpHttpEndpoint(endpoint = resolveCdpEndpoint()) {
  if (!endpoint) throw new Error('CDP endpoint is required');
  const url = new URL(endpoint);
  if (url.protocol === 'ws:') url.protocol = 'http:';
  if (url.protocol === 'wss:') url.protocol = 'https:';
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`unsupported CDP endpoint protocol: ${url.protocol}`);
  }
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export async function fetchCdpJson(
  path,
  {
    endpoint = resolveCdpEndpoint(),
    timeoutMs = 10_000,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const base = resolveCdpHttpEndpoint(endpoint);
    const response = await fetchImpl(`${base}/${String(path).replace(/^\/+/, '')}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`CDP HTTP ${response.status} for ${path}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function listCdpTargets(options = {}) {
  const targets = await fetchCdpJson('json/list', options);
  if (!Array.isArray(targets)) throw new Error('CDP target list is not an array');
  return targets;
}

export async function waitForCdpTarget(
  predicate,
  {
    timeoutMs = 30_000,
    pollIntervalMs = 500,
    ...listOptions
  } = {},
) {
  const deadline = Date.now() + timeoutMs;
  do {
    const target = (await listCdpTargets(listOptions)).find(predicate);
    if (target) return target;
    if (Date.now() >= deadline) break;
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
  } while (Date.now() <= deadline);
  throw new Error(`CDP target not found within ${timeoutMs}ms`);
}

export class RawCdpClient {
  constructor(
    url,
    {
      name = 'cdp',
      timeoutMs = 30_000,
      WebSocketImpl,
      logger = () => {},
    } = {},
  ) {
    this.url = url;
    this.name = name;
    this.timeoutMs = timeoutMs;
    this.WebSocketImpl = WebSocketImpl;
    this.logger = logger;
    this.id = 0;
    this.pending = new Map();
    this.ws = null;
  }

  async connect() {
    const WebSocketApi = this.WebSocketImpl ?? (await import('ws')).WebSocket;
    await withTimeout(new Promise((resolveConnect, rejectConnect) => {
      this.ws = new WebSocketApi(this.url, { perMessageDeflate: false });
      this.ws.once('open', resolveConnect);
      this.ws.once('error', rejectConnect);
      this.ws.on('message', (raw) => this.#handleMessage(raw));
      this.ws.on('error', (error) => this.logger(`${this.name} WS error: ${error.message}`));
      this.ws.on('close', () => this.#rejectPending(new Error(`${this.name} WS closed`)));
    }), this.timeoutMs, `${this.name} CDP connection`);
    return this;
  }

  async send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error(`${this.name} WS is not open`);
    }
    const id = ++this.id;
    return await withTimeout(new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        this.pending.delete(id);
        rejectSend(error);
      }
    }), this.timeoutMs, `${this.name} CDP ${method}`).finally(() => {
      this.pending.delete(id);
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails;
      throw new Error(`${detail.text ?? 'Runtime.evaluate failed'} ${detail.exception?.description ?? ''}`.trim());
    }
    return result.result?.value;
  }

  async navigate(url, { settleMs = 0 } = {}) {
    await this.send('Page.enable');
    await this.send('Page.navigate', { url });
    if (settleMs > 0) await sleep(settleMs);
  }

  close() {
    this.#rejectPending(new Error(`${this.name} CDP client closed`));
    this.ws?.close();
  }

  #handleMessage(raw) {
    const message = JSON.parse(raw.toString());
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }

  #rejectPending(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
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
    if (/^https?:/.test(String(rawUrl)) && typeof candidate.evaluate === 'function') {
      const runtimeId = await candidate.evaluate(
        () => globalThis.chrome?.runtime?.id ?? null,
      ).catch(() => null);
      if (runtimeId) return runtimeId;
    }
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
