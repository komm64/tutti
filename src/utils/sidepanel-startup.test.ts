import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootstrapSidepanel } from '../../entrypoints/sidepanel/startup';
import { log } from './logger';

describe('sidepanel startup', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ships an English loading shell before the module starts', () => {
    const html = readFileSync(
      new URL('../../entrypoints/sidepanel/index.html', import.meta.url),
      'utf8',
    );

    expect(html).toContain('lang="en"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Loading...');
  });

  it('keeps Loading visible until localization finishes, then mounts once', async () => {
    vi.useFakeTimers();
    vi.spyOn(log, 'warn').mockImplementation(() => undefined);
    vi.spyOn(log, 'info').mockImplementation(() => undefined);
    const target = new Window().document.createElement('div') as unknown as HTMLElement;
    target.setAttribute('aria-busy', 'true');
    target.textContent = 'Loading...';
    let finishInitialization!: () => void;
    const initialize = vi.fn(() => new Promise<void>((resolve) => {
      finishInitialization = resolve;
    }));
    const mount = vi.fn(() => ({ mounted: true }));

    const startup = bootstrapSidepanel({ target, initialize, mount });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(target.textContent).toBe('Loading...');
    expect(target.getAttribute('aria-busy')).toBe('true');
    expect(mount).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledOnce();

    finishInitialization();
    await expect(startup).resolves.toEqual({ mounted: true });
    expect(target.textContent).toBe('');
    expect(target.hasAttribute('aria-busy')).toBe(false);
    expect(mount).toHaveBeenCalledOnce();
  });

  it('mounts with browser defaults after a real initialization error', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => undefined);
    vi.spyOn(log, 'info').mockImplementation(() => undefined);
    const target = new Window().document.createElement('div') as unknown as HTMLElement;
    target.textContent = 'Loading...';
    const mount = vi.fn(() => 'mounted');

    await expect(bootstrapSidepanel({
      target,
      initialize: async () => { throw new Error('storage unavailable'); },
      mount,
    })).resolves.toBe('mounted');

    expect(log.error).toHaveBeenCalledOnce();
    expect(mount).toHaveBeenCalledOnce();
  });
});
