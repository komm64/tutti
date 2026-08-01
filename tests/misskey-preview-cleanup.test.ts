import { describe, expect, it, vi } from 'vitest';
import {
  createMisskeyPreviewUploadTracker,
  isMisskeyDriveUploadUrl,
} from '../scripts/e2e/misskey-preview-cleanup.mjs';

class FakeContext {
  private readonly listeners = new Map<string, Set<(value: unknown) => void>>();

  on(event: string, listener: (value: unknown) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: (value: unknown) => void) {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, value: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(value);
  }
}

function uploadResponse(id: string, { ok = true } = {}) {
  return {
    url: () => 'https://misskey.io/api/drive/files/create',
    ok: () => ok,
    json: async () => ({ id }),
  };
}

describe('Misskey preview Drive cleanup', () => {
  it('recognizes only the Drive upload endpoint', () => {
    expect(isMisskeyDriveUploadUrl('https://misskey.io/api/drive/files/create')).toBe(true);
    expect(isMisskeyDriveUploadUrl('https://misskey.io/api/notes/create')).toBe(false);
    expect(isMisskeyDriveUploadUrl('not a URL')).toBe(false);
  });

  it('deletes each successful upload captured after the case checkpoint once', async () => {
    const context = new FakeContext();
    const deleteFiles = vi.fn(async (_context: unknown, fileIds: string[]) => ({
      deleted: fileIds.length,
      failures: [],
    }));
    const tracker = createMisskeyPreviewUploadTracker(context, { deleteFiles });
    const checkpoint = tracker.checkpoint();

    context.emit('response', uploadResponse('file-1'));
    context.emit('response', uploadResponse('file-1'));
    context.emit('response', uploadResponse('file-2'));
    context.emit('response', uploadResponse('failed-file', { ok: false }));

    await expect(tracker.cleanupSince(checkpoint)).resolves.toEqual({
      uploaded: 2,
      deleted: 2,
      failures: [],
    });
    expect(deleteFiles).toHaveBeenCalledOnce();
    expect(deleteFiles).toHaveBeenCalledWith(context, ['file-1', 'file-2']);

    tracker.dispose();
    context.emit('response', uploadResponse('file-3'));
    await expect(tracker.cleanupSince(tracker.checkpoint())).resolves.toEqual({
      uploaded: 0,
      deleted: 0,
      failures: [],
    });
  });

  it('keeps response-body failures non-fatal and visible to diagnostics', async () => {
    const context = new FakeContext();
    const deleteFiles = vi.fn();
    const warn = vi.fn();
    const tracker = createMisskeyPreviewUploadTracker(context, { deleteFiles, warn });
    const checkpoint = tracker.checkpoint();
    context.emit('response', {
      url: () => 'https://misskey.io/api/drive/files/create',
      ok: () => true,
      json: async () => { throw new Error('response body unavailable'); },
    });

    await expect(tracker.cleanupSince(checkpoint)).resolves.toEqual({
      uploaded: 0,
      deleted: 0,
      failures: [],
    });
    expect(deleteFiles).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('response body unavailable'));
  });
});
