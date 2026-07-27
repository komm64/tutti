import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostResultMessage } from '../messages';
import { DEFAULT_SELECTED_PLATFORMS } from './platforms';
import {
  createComposerController,
  type ComposerDraftSnapshot,
} from './composer-controller';

afterEach(() => {
  vi.useRealTimers();
});

describe('composer controller', () => {
  it('loads draft and merges only known persisted platform keys', async () => {
    const controller = createComposerController({
      getDraft: vi.fn(async () => ({ text: 'saved draft' })),
      getSelectedPlatforms: vi.fn(async () => ({
        x: false,
        bluesky: true,
        unknown: true,
      } as never)),
    });

    await expect(controller.loadDraft()).resolves.toEqual({
      text: 'saved draft',
      images: [],
      video: null,
    });
    const selected = await controller.loadSelectedPlatforms(DEFAULT_SELECTED_PLATFORMS);
    expect(selected.x).toBe(false);
    expect(selected.bluesky).toBe(true);
    expect(selected).not.toHaveProperty('unknown');
    expect(DEFAULT_SELECTED_PLATFORMS.x).toBe(true);
  });

  it('merges persisted selection into the latest caller state', async () => {
    let resolveStored!: (value: { x: boolean }) => void;
    const stored = new Promise<{ x: boolean }>((resolve) => {
      resolveStored = resolve;
    });
    const controller = createComposerController({
      getSelectedPlatforms: () => stored,
    });
    const selected = { ...DEFAULT_SELECTED_PLATFORMS };

    const loading = controller.loadSelectedPlatforms(selected);
    selected.youtube = true;
    resolveStored({ x: false });

    await expect(loading).resolves.toMatchObject({ x: false, youtube: true });
  });

  it('debounces and serializes draft snapshots', async () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn(async () => {});
    const controller = createComposerController({ saveDraft });
    const first: ComposerDraftSnapshot = {
      text: 'first',
      images: [],
      video: null,
    };
    const second: ComposerDraftSnapshot = {
      text: 'second',
      images: [{
        name: 'image.png',
        type: 'image/png',
        data: 'AA==',
        previewUrl: 'blob:test',
      }],
      video: null,
    };

    controller.scheduleDraftSave(first);
    controller.scheduleDraftSave(second);
    await vi.advanceTimersByTimeAsync(299);
    expect(saveDraft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(saveDraft).toHaveBeenCalledOnce();
    expect(saveDraft).toHaveBeenCalledWith({
      text: 'second',
      images: [{ name: 'image.png', type: 'image/png', data: 'AA==' }],
      video: null,
    });
  });

  it('clones selection snapshots and lets immediate saves supersede pending work', async () => {
    vi.useFakeTimers();
    const saveSelectedPlatforms = vi.fn(async () => {});
    const controller = createComposerController({ saveSelectedPlatforms });
    const selected = { ...DEFAULT_SELECTED_PLATFORMS };

    controller.scheduleSelectedPlatformsSave(selected);
    selected.x = false;
    await controller.saveSelectedPlatforms(selected);
    await vi.runAllTimersAsync();

    expect(saveSelectedPlatforms).toHaveBeenCalledOnce();
    expect(saveSelectedPlatforms).toHaveBeenCalledWith({
      ...DEFAULT_SELECTED_PLATFORMS,
      x: false,
    });
  });

  it('cancels pending persistence on disposal', async () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn(async () => {});
    const saveSelectedPlatforms = vi.fn(async () => {});
    const controller = createComposerController({ saveDraft, saveSelectedPlatforms });

    controller.scheduleDraftSave({ text: 'draft', images: [], video: null });
    controller.scheduleSelectedPlatformsSave(DEFAULT_SELECTED_PLATFORMS);
    controller.dispose();
    await vi.runAllTimersAsync();

    expect(saveDraft).not.toHaveBeenCalled();
    expect(saveSelectedPlatforms).not.toHaveBeenCalled();
  });

  it('coordinates media order, removal, and alt state transitions', () => {
    const controller = createComposerController();
    const state = {
      images: [
        {
          name: 'a.png',
          type: 'image/png',
          data: 'AA==',
          previewUrl: 'blob:a',
        },
        {
          name: 'b.png',
          type: 'image/png',
          data: 'AA==',
          previewUrl: 'blob:b',
        },
      ],
      video: null,
      imageAlts: ['alt a', 'alt b'],
    };

    const moved = controller.moveImage(state, 1, -1);
    expect(moved.images.map((image) => image.name)).toEqual(['b.png', 'a.png']);
    expect(moved.imageAlts).toEqual(['alt b', 'alt a']);

    const withAlt = controller.setImageAlt(moved, 0, 'updated');
    expect(withAlt.imageAlts).toEqual(['updated', 'alt a']);
    expect(moved.imageAlts).toEqual(['alt b', 'alt a']);

    const removed = controller.removeImage(withAlt, 1);
    expect(removed.images.map((image) => image.name)).toEqual(['b.png']);
    expect(removed.imageAlts).toEqual(['updated']);
  });

  it('owns history refresh, storage subscription, and object URL cleanup', async () => {
    let storageListener:
      | ((changes: Record<string, unknown>, area: string) => void)
      | undefined;
    const unsubscribe = vi.fn();
    const revokeHistoryUrls = vi.fn();
    const loadHistory = vi
      .fn()
      .mockResolvedValueOnce({
        entries: [{ id: 'first' }],
        thumbs: { first: ['blob:first'] },
        objectUrls: ['blob:first'],
      })
      .mockResolvedValueOnce({
        entries: [{ id: 'second' }],
        thumbs: { second: ['blob:second'] },
        objectUrls: ['blob:second'],
      });
    const subscriber = vi.fn();
    const controller = createComposerController({
      loadHistory,
      revokeHistoryUrls,
      subscribeStorageChanges: (listener) => {
        storageListener = listener;
        return unsubscribe;
      },
    });

    const stop = controller.subscribeHistory(subscriber);
    await vi.waitFor(() => expect(subscriber).toHaveBeenCalledOnce());
    expect(subscriber).toHaveBeenLastCalledWith({
      entries: [{ id: 'first' }],
      thumbs: { first: ['blob:first'] },
    });

    storageListener?.({ unrelated: {} }, 'local');
    storageListener?.({ postHistory: {} }, 'sync');
    expect(loadHistory).toHaveBeenCalledOnce();

    storageListener?.({ postHistory: {} }, 'local');
    await vi.waitFor(() => expect(subscriber).toHaveBeenCalledTimes(2));
    expect(revokeHistoryUrls).toHaveBeenCalledWith(['blob:first']);

    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
    controller.dispose();
    expect(revokeHistoryUrls).toHaveBeenLastCalledWith(['blob:second']);
  });

  it('restores and streams background posting state and update notifications', async () => {
    let runtimeListener: ((message: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    const sendRuntimeMessage = vi.fn(async () => ({
      posting: true,
      postingState: {
        pending: ['x'],
        results: [],
        done: false,
      },
    }));
    let current = {
      posting: false,
      pendingPlatforms: [],
      lastResults: null,
      compressionProgress: null,
      compressionStartedAt: null,
      compressionEtaS: null,
    };
    const onPostingState = vi.fn((next) => {
      current = next;
    });
    const onUpdateAvailable = vi.fn();
    const controller = createComposerController({
      sendRuntimeMessage,
      subscribeRuntimeMessages: (listener) => {
        runtimeListener = listener;
        return unsubscribe;
      },
    });

    const stop = controller.subscribeBackgroundSync({
      getPostingState: () => current,
      onPostingState,
      onUpdateAvailable,
    });
    await vi.waitFor(() => expect(onPostingState).toHaveBeenCalledOnce());
    expect(sendRuntimeMessage).toHaveBeenCalledWith({ type: 'GET_BG_STATE' });
    expect(onPostingState).toHaveBeenLastCalledWith({
      ...current,
      posting: true,
      pendingPlatforms: ['x'],
    }, 'restore');

    runtimeListener?.({
      type: 'CONVERSION_PROGRESS',
      stage: 'load',
      progress: 0.25,
    });
    expect(onPostingState).toHaveBeenLastCalledWith({
      ...current,
      compressionProgress: { stage: 'load', progress: 0.25 },
    }, 'progress');

    runtimeListener?.({
      type: 'EXTENSION_UPDATE_AVAILABLE',
      state: { available: true, version: '0.6.0', applying: false },
    });
    expect(onUpdateAvailable).toHaveBeenCalledWith({
      available: true,
      version: '0.6.0',
      applying: false,
    });

    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('owns diagnostics, reporting, clipboard, and update workflows', async () => {
    const sendRuntimeMessage = vi.fn(async (message: unknown) => {
      const type = (message as { type?: string }).type;
      if (type === 'DIAGNOSE_REQUEST') return { report: { status: 'ok' } };
      if (type === 'GET_EXTENSION_UPDATE_STATE') {
        return { state: { available: true, version: '0.6.0' } };
      }
      if (type === 'APPLY_EXTENSION_UPDATE') return { ok: false, error: 'posting_in_progress' };
      return undefined;
    });
    const writeClipboard = vi.fn(async () => {});
    const submitErrorReport = vi.fn(async () => ({ ok: true, issueUrl: 'https://example.test/1' }));
    const openGitHubIssue = vi.fn(async () => {});
    const controller = createComposerController({
      sendRuntimeMessage,
      writeClipboard,
      submitErrorReport,
      openGitHubIssue,
      reportEndpoint: 'https://report.example.test',
    });
    const context = { version: '0.5.49' } as never;

    await expect(controller.runDiagnostics()).resolves.toBe(
      JSON.stringify({ status: 'ok' }, null, 2),
    );
    await expect(controller.copyDiagnostics('diagnostics')).resolves.toBe(true);
    expect(writeClipboard).toHaveBeenCalledWith('diagnostics');
    await expect(controller.refreshExtensionUpdateState()).resolves.toEqual({
      available: true,
      version: '0.6.0',
    });
    await expect(controller.applyExtensionUpdate()).resolves.toEqual({
      ok: false,
      error: 'posting_in_progress',
    });

    await expect(controller.submitErrorReport(
      'failed',
      context,
      (hours) => `deduped ${hours}`,
    )).resolves.toEqual({ ok: true, issueUrl: 'https://example.test/1' });
    expect(submitErrorReport).toHaveBeenCalledWith({
      errorText: 'failed',
      context,
      endpoint: 'https://report.example.test',
      dedupedMessage: expect.any(Function),
    });

    await controller.openGitHubIssue('failed', context, 'note', 'overflow');
    expect(openGitHubIssue).toHaveBeenCalledWith({
      errorText: 'failed',
      context,
      note: 'note',
      overflowNote: 'overflow',
    });
  });

  it('owns successful submission transitions and durable draft cleanup', async () => {
    const clearDraft = vi.fn(async () => {});
    const revokeImagePreviews = vi.fn();
    const revokeVideoPreview = vi.fn();
    const sendPostRequest = vi.fn(async () => ({
      results: [{
        type: 'POST_RESULT' as const,
        platform: 'x' as const,
        success: true,
        url: 'https://x.com/alice/status/123',
      }],
    }));
    const controller = createComposerController({
      sendPostRequest,
      clearDraft,
      revokeImagePreviews,
      revokeVideoPreview,
      loadHistory: vi.fn(async () => ({
        entries: [],
        thumbs: {},
        objectUrls: [],
      })),
    });
    const image = {
      name: 'image.png',
      type: 'image/png',
      data: 'AA==',
      previewUrl: 'blob:image',
    };
    let results: PostResultMessage[] | null = null;
    const patches: unknown[] = [];
    const input = {
      text: 'hello',
      selectedIds: ['x' as const],
      images: [image],
      video: null,
      imageAlts: ['alt'],
      cw: '',
      visibility: 'public' as const,
      trimToS: null,
      autoPost: true,
      backgroundNoResponseMessage: 'no response',
    };

    await controller.submitPlatforms(input, ['x'], false, {
      getLastResults: () => results,
      applyPatch: (patch) => {
        patches.push(patch);
        if ('lastResults' in patch) results = patch.lastResults as never;
      },
    });

    expect(sendPostRequest).toHaveBeenCalledWith(expect.objectContaining({
      text: 'hello',
      platforms: ['x'],
      autoPost: true,
      intent: 'new',
    }));
    expect(patches[0]).toEqual({
      posting: true,
      lastResults: [],
      pendingPlatforms: ['x'],
      errorMessage: null,
    });
    expect(patches).toContainEqual(expect.objectContaining({
      pendingPlatforms: [],
      draft: { text: '', images: [], video: null },
      lastResultDraftKey: expect.any(String),
    }));
    expect(patches.at(-1)).toEqual({ posting: false, pendingPlatforms: [] });
    expect(revokeImagePreviews).toHaveBeenCalledWith([image]);
    expect(revokeVideoPreview).toHaveBeenCalledWith(null);
    expect(clearDraft).toHaveBeenCalledOnce();
  });

  it('retries only failed platforms and preserves successful results', async () => {
    const sendPostRequest = vi.fn(async () => ({
      results: [{
        type: 'POST_RESULT' as const,
        platform: 'threads' as const,
        success: true,
        preview: true,
      }],
    }));
    const controller = createComposerController({
      sendPostRequest,
      loadHistory: vi.fn(async () => ({
        entries: [],
        thumbs: {},
        objectUrls: [],
      })),
    });
    let results: PostResultMessage[] = [
      { type: 'POST_RESULT' as const, platform: 'x' as const, success: true },
      { type: 'POST_RESULT' as const, platform: 'threads' as const, success: false },
    ];
    const input = {
      text: 'retry',
      selectedIds: ['x' as const, 'threads' as const],
      images: [],
      video: null,
      imageAlts: [],
      cw: '',
      visibility: 'public' as const,
      trimToS: null,
      autoPost: false,
      backgroundNoResponseMessage: 'no response',
    };

    await controller.retryFailed(input, false, {
      getLastResults: () => results,
      applyPatch: (patch) => {
        if ('lastResults' in patch && patch.lastResults) results = patch.lastResults;
      },
    });

    expect(sendPostRequest).toHaveBeenCalledWith(expect.objectContaining({
      platforms: ['threads'],
      intent: 'retry',
    }));
    expect(results).toEqual([
      { type: 'POST_RESULT', platform: 'x', success: true },
      {
        type: 'POST_RESULT',
        platform: 'threads',
        success: true,
        preview: true,
      },
    ]);
  });
});
