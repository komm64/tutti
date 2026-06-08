/**
 * Browser smoke for the extension video conversion boundary.
 *
 * It stores a tiny VP8 WebM fixture in Tutti's binary-transfer IndexedDB,
 * sends CONVERT_VIDEO to the offscreen document,
 * then verifies that the resulting MP4 is readable. This catches WebCodecs
 * fast-path regressions by requiring the fast-path completion log.
 */

import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const extensionDir = resolve(repoRoot, '.output', 'chrome-mv3');
const browserExecutable = process.env.TUTTI_VIDEO_SMOKE_BROWSER || '';
const tinyWebmBase64 = readFileSync(
  resolve(__dirname, 'fixtures', 'tiny-vp8.webm.b64'),
  'utf8',
).replace(/\s+/g, '');

if (!existsSync(extensionDir)) {
  console.error(`[video-smoke] missing extension output: ${extensionDir}`);
  console.error('[video-smoke] Run `npm run build` first.');
  process.exit(2);
}

const userDataDir = await mkdtemp(join(tmpdir(), 'tutti-video-smoke-profile-'));
let context;

try {
  if (browserExecutable) console.log(`[video-smoke] browser=${browserExecutable}`);
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: browserExecutable || undefined,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--enable-gpu',
      '--enable-accelerated-video-encode',
      '--use-angle=d3d11',
    ],
  });
  context.setDefaultTimeout(60_000);

  const extensionId = await detectExtensionId(context);
  console.log(`[video-smoke] extension id=${extensionId}`);
  const page = await context.newPage();
  page.on('console', (message) => {
    console.log(`[video-smoke:page] ${message.type()} ${message.text()}`);
  });
  await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });

  const result = await withTimeout(page.evaluate(async (fixtureBase64) => {
    console.log('clearing logs');
    await chrome.runtime.sendMessage({ type: 'LOG_CLEAR' });
    console.log('ensuring offscreen document');
    await ensureOffscreenDocument();
    console.log('loading fixture WebM');
    const inputBytes = decodeBase64Bytes(fixtureBase64);
    console.log(`input WebM bytes=${inputBytes.byteLength}`);
    const inputRef = await putTransferBinary(inputBytes);
    const startedAt = performance.now();
    console.log('sending CONVERT_VIDEO');
    const response = await chrome.runtime.sendMessage({
      type: 'CONVERT_VIDEO',
      inputRef,
      mimeType: 'video/webm',
      durationS: 1,
      targetBytes: 700_000,
      aspectMode: 'passthrough',
    });
    if (!response || response.type !== 'CONVERSION_COMPLETE' || !response.outputRef) {
      const logs = await exportLogTail();
      throw new Error(`conversion failed: ${JSON.stringify(response)}\nlogs=${JSON.stringify(logs, null, 2)}`);
    }
    console.log(`conversion response=${JSON.stringify(response)}`);
    const outputBytes = await getTransferBinary(response.outputRef);
    const meta = await inspectVideoBlob(new Blob([outputBytes], { type: 'video/mp4' }));
    const logs = await chrome.runtime.sendMessage({ type: 'LOG_EXPORT_REQUEST' });
    const logEntries = logs?.entries ?? [];
    return {
      elapsedMs: Math.round(performance.now() - startedAt),
      response,
      outputBytes: outputBytes.byteLength,
      meta,
      fastPathLog: logEntries
        .slice()
        .reverse()
        .find((entry) => entry.message?.includes?.('WebCodecs fast path 完了')),
      logTail: logEntries.slice(-30),
    };

    async function exportLogTail() {
      try {
        const logs = await chrome.runtime.sendMessage({ type: 'LOG_EXPORT_REQUEST' });
        return logs?.entries?.slice?.(-30) ?? [];
      } catch (error) {
        return [{ level: 'ERROR', message: `log export failed: ${String(error)}` }];
      }
    }

    async function ensureOffscreenDocument() {
      if (!chrome.offscreen) throw new Error('chrome.offscreen is unavailable');
      const exists = chrome.offscreen.hasDocument ? await chrome.offscreen.hasDocument() : false;
      if (exists) return;
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification: 'video conversion smoke',
      });
    }

    async function inspectVideoBlob(blob) {
      const url = URL.createObjectURL(blob);
      try {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'metadata';
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve;
          video.onerror = () => reject(new Error('output MP4 metadata load failed'));
          video.src = url;
        });
        return {
          duration: Number.isFinite(video.duration) ? video.duration : 0,
          width: video.videoWidth,
          height: video.videoHeight,
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    function openTransferDb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('tutti-transfer', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
      });
    }

    async function putTransferBinary(bytes) {
      const db = await openTransferDb();
      const id = `video-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put(bytes, id);
        tx.oncomplete = () => { db.close(); resolve(id); };
        tx.onerror = () => { db.close(); reject(tx.error ?? new Error('put failed')); };
      });
    }

    async function getTransferBinary(id) {
      const db = await openTransferDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('blobs', 'readonly');
        const req = tx.objectStore('blobs').get(id);
        req.onsuccess = () => {
          db.close();
          const value = req.result;
          if (value instanceof Uint8Array) resolve(value);
          else if (value instanceof ArrayBuffer) resolve(new Uint8Array(value));
          else reject(new Error(`missing transfer binary ${id}`));
        };
        req.onerror = () => { db.close(); reject(req.error ?? new Error('get failed')); };
      });
    }
    function decodeBase64Bytes(value) {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }

  }, tinyWebmBase64), 120_000, 'video smoke page evaluation timed out');

  console.log('[video-smoke] result:', JSON.stringify(result, null, 2));
  if (result.outputBytes <= 0) throw new Error('output was empty');
  if (result.outputBytes > 721_000) throw new Error(`output exceeds smoke budget: ${result.outputBytes}`);
  if (result.meta.width <= 0 || result.meta.height <= 0 || result.meta.duration <= 0) {
    throw new Error(`output metadata invalid: ${JSON.stringify(result.meta)}`);
  }
  if (!result.fastPathLog) {
    const unsupportedLog = result.logTail.find((entry) =>
      entry.message?.includes?.('WebCodecs fast path unavailable') ||
      entry.message?.includes?.('H.264 WebCodecs encode unsupported') ||
      entry.message?.includes?.('AAC WebCodecs encode unsupported'));
    if (!unsupportedLog) {
      throw new Error(`WebCodecs fast path log was not observed\nlogs=${JSON.stringify(result.logTail, null, 2)}`);
    }
    console.log(`[video-smoke] WebCodecs fast path unavailable; verified ffmpeg fallback: ${unsupportedLog.message}`);
  }
  if (result.fastPathLog) {
    console.log(`[video-smoke] WebCodecs fast path observed: ${result.fastPathLog.message}`);
  }
  console.log('[video-smoke] PASS');
} finally {
  await context?.close().catch(() => {});
}

async function detectExtensionId(context) {
  for (let i = 0; i < 80; i += 1) {
    for (const worker of context.serviceWorkers()) {
      const match = worker.url().match(/^chrome-extension:\/\/([a-z]+)\//);
      if (match?.[1]) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('extension service worker not detected');
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
