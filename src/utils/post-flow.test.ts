import { afterEach, describe, expect, it, vi } from 'vitest';
import { executePostFlow, maybeConfirmDialog } from './post-flow';

describe('maybeConfirmDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns after the short grace period when no dialog appears', async () => {
    vi.stubGlobal('document', {
      querySelector: () => null,
    });
    const start = Date.now();
    await maybeConfirmDialog(['Post anyway'], 10);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe('executePostFlow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports compose input missing before post button missing for URL-prefill flows', async () => {
    vi.stubGlobal('document', {
      body: {},
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
    });

    await expect(executePostFlow({
      prefillsViaUrl: true,
      textareaSelector: 'textarea',
      postButtonTexts: ['Post'],
      text: 'hello',
      composeInputTimeoutMs: 10,
      postButtonTimeoutMs: 10,
    })).rejects.toThrow('投稿入力欄が見つかりません');
  });

  it('allows URL-prefill preview when the editor and enabled post button are present', async () => {
    const editor = { tagName: 'DIV' } as HTMLElement;
    const button = {
      style: {},
      getAttribute: vi.fn(() => null),
      disabled: false,
    } as unknown as HTMLElement;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.stubGlobal('document', {
      body: {},
      querySelector: vi.fn((selector: string) => selector === 'textarea' ? editor : button),
      querySelectorAll: vi.fn(() => []),
    });

    await expect(executePostFlow({
      prefillsViaUrl: true,
      textareaSelector: 'textarea',
      postButtonSelector: '.post',
      text: 'hello',
      dryRun: true,
      composeInputTimeoutMs: 10,
      postButtonTimeoutMs: 10,
    })).resolves.toBeUndefined();
  });

  it('allows URL-prefill preview when the editor is present even if the post button selector misses', async () => {
    const editor = { tagName: 'DIV', style: {} } as HTMLElement;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.stubGlobal('document', {
      body: {},
      querySelector: vi.fn((selector: string) => selector === 'textarea' ? editor : null),
      querySelectorAll: vi.fn(() => []),
    });

    await expect(executePostFlow({
      prefillsViaUrl: true,
      textareaSelector: 'textarea',
      postButtonSelector: '.post',
      text: 'hello',
      dryRun: true,
      composeInputTimeoutMs: 10,
      postButtonTimeoutMs: 10,
    })).resolves.toBeUndefined();
  });

  it('still requires the post button for URL-prefill real posting', async () => {
    const editor = { tagName: 'DIV', style: {} } as HTMLElement;
    vi.stubGlobal('document', {
      body: {},
      querySelector: vi.fn((selector: string) => selector === 'textarea' ? editor : null),
      querySelectorAll: vi.fn(() => []),
    });

    await expect(executePostFlow({
      prefillsViaUrl: true,
      textareaSelector: 'textarea',
      postButtonSelector: '.post',
      text: 'hello',
      dryRun: false,
      composeInputTimeoutMs: 10,
      postButtonTimeoutMs: 10,
    })).rejects.toThrow('投稿ボタンが見つかりません');
  });

  it('does not require the editor selector for URL-prefill text-only preview when the button is present', async () => {
    const button = {
      style: {},
      getAttribute: vi.fn(() => null),
      disabled: false,
    } as unknown as HTMLElement;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.stubGlobal('document', {
      body: {},
      querySelector: vi.fn((selector: string) => selector === '.post' ? button : null),
      querySelectorAll: vi.fn(() => []),
    });

    await expect(executePostFlow({
      prefillsViaUrl: true,
      textareaSelector: 'textarea',
      postButtonSelector: '.post',
      text: 'hello',
      dryRun: true,
      composeInputTimeoutMs: 10,
      postButtonTimeoutMs: 10,
    })).resolves.toBeUndefined();
  });
});
