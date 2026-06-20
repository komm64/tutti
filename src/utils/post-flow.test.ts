import { afterEach, describe, expect, it, vi } from 'vitest';
import { executePostFlow, maybeConfirmDialog, resolvePostButtonTimeoutMs } from './post-flow';

describe('maybeConfirmDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns after the short grace period when no dialog appears', async () => {
    vi.stubGlobal('document', {
      body: {},
      querySelector: () => null,
      querySelectorAll: () => [],
    });
    vi.stubGlobal('MutationObserver', undefined);
    const start = Date.now();
    await maybeConfirmDialog(['Post anyway'], 10);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('ignores the original compose dialog and clicks a new Tumblr no-tags confirmation', async () => {
    const submitButton = {
      textContent: 'Post',
      getAttribute: vi.fn(() => null),
      disabled: false,
      click: vi.fn(),
    } as unknown as HTMLElement;
    const confirmButton = {
      textContent: 'Post without tags',
      getAttribute: vi.fn(() => null),
      disabled: false,
      click: vi.fn(),
    } as unknown as HTMLElement;
    const composeDialog = {
      querySelectorAll: vi.fn(() => [submitButton]),
    } as unknown as HTMLElement;
    const confirmDialog = {
      querySelectorAll: vi.fn(() => [confirmButton]),
    } as unknown as HTMLElement;
    vi.stubGlobal('document', {
      body: {},
      querySelector: () => null,
      querySelectorAll: vi.fn((selector: string) => selector === '[role="dialog"]'
        ? [composeDialog, confirmDialog]
        : []),
    });
    vi.stubGlobal('MutationObserver', undefined);

    await expect(maybeConfirmDialog(['Post without tags'], 10, {
      ignoredDialogs: [composeDialog],
      excludedButtons: [submitButton],
    })).resolves.toBe(true);

    expect(confirmButton.click).toHaveBeenCalledOnce();
    expect(submitButton.click).not.toHaveBeenCalled();
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
      prefillsViaUrl: false,
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
      querySelectorAll: vi.fn((selector: string) => selector === '.post' ? [button] : []),
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

  it('checks the URL-prefill editor before attaching media', async () => {
    vi.stubGlobal('document', {
      body: {},
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
    });

    await expect(executePostFlow({
      prefillsViaUrl: true,
      textareaSelector: 'textarea',
      postButtonSelector: '.post',
      dropTargetSelector: '.drop',
      text: '',
      images: [{ name: 'image.png', type: 'image/png', data: 'AAAA' }],
      composeInputTimeoutMs: 10,
      postButtonTimeoutMs: 10,
    })).rejects.toThrow('投稿入力欄が見つかりません');
  });

  it('allows a disabled post button only for explicit media preview dry-runs', async () => {
    const editor = { tagName: 'DIV' } as HTMLElement;
    const button = {
      style: {},
      getAttribute: vi.fn(() => null),
      disabled: true,
    } as unknown as HTMLElement;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.stubGlobal('document', {
      body: {},
      querySelector: vi.fn((selector: string) => selector === 'textarea' ? editor : null),
      querySelectorAll: vi.fn((selector: string) => selector === '.post' ? [button] : []),
    });

    await expect(executePostFlow({
      prefillsViaUrl: true,
      textareaSelector: 'textarea',
      postButtonSelector: '.post',
      text: '',
      dryRun: true,
      allowDisabledPostButtonInPreview: true,
      composeInputTimeoutMs: 10,
      postButtonTimeoutMs: 10,
    })).resolves.toBeUndefined();
  });

  it('uses an enabled selector match instead of getting stuck on an earlier disabled button', async () => {
    const editor = { tagName: 'DIV' } as HTMLElement;
    const disabledButton = {
      getAttribute: vi.fn((name: string) => name === 'aria-disabled' ? 'true' : null),
      disabled: true,
      click: vi.fn(),
    } as unknown as HTMLElement;
    const enabledButton = {
      getAttribute: vi.fn(() => null),
      disabled: false,
      click: vi.fn(),
    } as unknown as HTMLElement;
    vi.stubGlobal('document', {
      body: {},
      querySelector: vi.fn((selector: string) => selector === 'textarea' ? editor : null),
      querySelectorAll: vi.fn((selector: string) => {
        if (selector === '.primary') return [disabledButton];
        if (selector === '.secondary') return [enabledButton];
        return [];
      }),
    });

    await expect(executePostFlow({
      prefillsViaUrl: true,
      textareaSelector: 'textarea',
      postButtonSelector: '.primary, .secondary',
      text: 'hello',
      dryRun: false,
      composeInputTimeoutMs: 10,
      postButtonTimeoutMs: 10,
      afterClickDelayMs: 0,
    })).resolves.toBeUndefined();
    expect(enabledButton.click).toHaveBeenCalledOnce();
    expect(disabledButton.click).not.toHaveBeenCalled();
  });
});

describe('resolvePostButtonTimeoutMs', () => {
  it('extends video post button waits even when callers pass a 30s timeout', () => {
    expect(resolvePostButtonTimeoutMs(30000, true)).toBe(120000);
  });

  it('keeps explicit non-video timeouts unchanged', () => {
    expect(resolvePostButtonTimeoutMs(30000, false)).toBe(30000);
  });
});
