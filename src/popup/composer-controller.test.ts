import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SELECTED_PLATFORMS } from './platforms';
import {
  createComposerController,
  type ComposerDraftSnapshot,
} from './composer-controller';

afterEach(() => {
  vi.useRealTimers();
});

describe('composer persistence controller', () => {
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
});
