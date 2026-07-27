import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  connectPlaywrightCdp,
  connectPuppeteerCdp,
  disconnectCdp,
  extensionIdFromUrl,
  loadE2eFixture,
  resolveCdpEndpoint,
  resolveExtensionId,
  resolveFixturePath,
  withCdpBrowser,
  withTemporaryDirectory,
  withTimeout,
} from '../scripts/e2e/cdp-harness.mjs';

describe('CDP harness', () => {
  it('resolves WS, HTTP, and fallback endpoints in priority order', () => {
    expect(resolveCdpEndpoint({
      env: { E2E_CDP: 'http://surface:9223', E2E_CDP_WS: 'ws://surface/devtools/browser/1' },
    })).toBe('ws://surface/devtools/browser/1');
    expect(resolveCdpEndpoint({ env: { E2E_CDP: 'http://surface:9223' } }))
      .toBe('http://surface:9223');
    expect(resolveCdpEndpoint({ env: {}, fallback: 'http://localhost:9333' }))
      .toBe('http://localhost:9333');
    expect(() => resolveCdpEndpoint({ env: {}, fallback: '', required: true }))
      .toThrow('E2E_CDP or E2E_CDP_WS is required');
  });

  it('connects Playwright with the normalized timeout', async () => {
    const browser = {};
    const connectOverCDP = vi.fn().mockResolvedValue(browser);
    await expect(connectPlaywrightCdp({
      chromium: { connectOverCDP },
      endpoint: 'http://surface:9223',
      timeoutMs: 42,
    })).resolves.toBe(browser);
    expect(connectOverCDP).toHaveBeenCalledWith('http://surface:9223', { timeout: 42 });
  });

  it('connects Puppeteer via HTTP or WS without duplicating discovery', async () => {
    const connect = vi.fn().mockResolvedValue({});
    await connectPuppeteerCdp({
      puppeteer: { connect },
      endpoint: 'http://surface:9223',
      timeoutMs: 51,
    });
    await connectPuppeteerCdp({
      puppeteer: { connect },
      endpoint: 'ws://surface/devtools/browser/2',
      timeoutMs: 52,
    });
    expect(connect.mock.calls[0]?.[0]).toEqual({
      browserURL: 'http://surface:9223',
      defaultViewport: null,
      protocolTimeout: 51,
    });
    expect(connect.mock.calls[1]?.[0]).toEqual({
      browserWSEndpoint: 'ws://surface/devtools/browser/2',
      defaultViewport: null,
      protocolTimeout: 52,
    });
  });

  it('preserves legacy Puppeteer connect option aliases during migration', async () => {
    const connect = vi.fn().mockResolvedValue({});
    await connectPuppeteerCdp({
      puppeteer: { connect },
      browserURL: 'http://localhost:9222',
      protocolTimeout: 91,
      slowMo: 10,
    });
    expect(connect).toHaveBeenCalledWith({
      browserURL: 'http://localhost:9222',
      defaultViewport: null,
      protocolTimeout: 91,
      slowMo: 10,
    });
  });

  it('discovers extension IDs from configuration, workers, pages, targets, and injected runtime', async () => {
    await expect(resolveExtensionId({}, {
      env: { E2E_EXTENSION_ID: 'configuredid' },
      timeoutMs: 1,
    })).resolves.toBe('configuredid');
    await expect(resolveExtensionId({
      serviceWorkers: () => [{ url: () => 'chrome-extension://workerid/background.js' }],
    }, { env: {}, timeoutMs: 1 })).resolves.toBe('workerid');
    await expect(resolveExtensionId({
      pages: async () => [{ url: () => 'chrome-extension://pageid/popup.html' }],
    }, { env: {}, timeoutMs: 1 })).resolves.toBe('pageid');
    await expect(resolveExtensionId({
      targets: () => [{ url: () => 'chrome-extension://targetid/options.html' }],
    }, { env: {}, timeoutMs: 1 })).resolves.toBe('targetid');
    await expect(resolveExtensionId({
      pages: () => [{
        url: () => 'https://x.com/home',
        evaluate: vi.fn().mockResolvedValue('runtimeid'),
      }],
    }, { env: {}, timeoutMs: 1 })).resolves.toBe('runtimeid');
  });

  it('rejects extension discovery when no supported target appears', async () => {
    await expect(resolveExtensionId({
      contexts: () => [{ pages: () => [{ url: () => 'https://example.com/' }] }],
    }, { env: {}, timeoutMs: 1, pollIntervalMs: 1 }))
      .rejects.toThrow('extension id not detected');
  });

  it('extracts only chrome-extension URLs', () => {
    expect(extensionIdFromUrl('chrome-extension://abcdef/popup.html')).toBe('abcdef');
    expect(extensionIdFromUrl('https://example.com/')).toBeNull();
  });

  it('bounds asynchronous work with a deterministic error', async () => {
    await expect(withTimeout(new Promise(() => {}), 1, 'fixture upload'))
      .rejects.toThrow('timed out after 1ms waiting for fixture upload');
    await expect(withTimeout(Promise.resolve('ok'), 100, 'quick work')).resolves.toBe('ok');
  });

  it('uses disconnect when available and closes only as a fallback', async () => {
    const disconnect = vi.fn();
    const close = vi.fn();
    await disconnectCdp({ disconnect, close });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();

    await disconnectCdp({ close });
    expect(close).toHaveBeenCalledOnce();
  });

  it('always disconnects a scoped CDP browser', async () => {
    const disconnect = vi.fn();
    await expect(withCdpBrowser(
      async () => ({ disconnect }),
      async () => { throw new Error('case failed'); },
    )).rejects.toThrow('case failed');
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('loads bounded fixtures and rejects path traversal', async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFile(join(root, 'pixel.bin'), Buffer.from([1, 2, 3]));
      await expect(loadE2eFixture('pixel.bin', 'application/octet-stream', {
        root,
        durationS: 2,
        required: true,
      })).resolves.toEqual({
        name: 'pixel.bin',
        type: 'application/octet-stream',
        data: 'AQID',
        bytes: 3,
        durationS: 2,
      });
      expect(() => resolveFixturePath('../escape.bin', { root }))
        .toThrow('fixture path escapes fixture root');
    });
  });

  it('removes temporary directories even when the case fails', async () => {
    let temporaryPath = '';
    await expect(withTemporaryDirectory(async (path) => {
      temporaryPath = path;
      await mkdir(join(path, 'nested'));
      await writeFile(join(path, 'nested', 'evidence.txt'), 'evidence');
      expect(await readFile(join(path, 'nested', 'evidence.txt'), 'utf8')).toBe('evidence');
      throw new Error('expected failure');
    }, { prefix: 'tutti-cdp-harness-test-' })).rejects.toThrow('expected failure');
    await expect(access(temporaryPath)).rejects.toThrow();
  });
});
