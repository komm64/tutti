import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageAttachment, PostResultMessage } from '../messages';

const mocks = vi.hoisted(() => ({
  addToPostHistory: vi.fn(),
  computePostFingerprint: vi.fn(),
  releaseAttachmentTransfers: vi.fn(),
  resolveAttachmentToBytes: vi.fn(),
  compressImageForHistory: vi.fn(),
  putMedia: vi.fn(),
}));

vi.mock('../storage', () => ({
  addToPostHistory: mocks.addToPostHistory,
}));
vi.mock('./post-fingerprint', () => ({
  computePostFingerprint: mocks.computePostFingerprint,
}));
vi.mock('../utils/attachment', () => ({
  releaseAttachmentTransfers: mocks.releaseAttachmentTransfers,
  resolveAttachmentToBytes: mocks.resolveAttachmentToBytes,
}));
vi.mock('../utils/history-media', () => ({
  compressImageForHistory: mocks.compressImageForHistory,
  putMedia: mocks.putMedia,
}));

import { recordHistoryEntry, releasePostAttachments } from './history-recorder';

describe('history fingerprint ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addToPostHistory.mockResolvedValue('entry-1');
    mocks.computePostFingerprint.mockResolvedValue('computed-fingerprint');
    mocks.releaseAttachmentTransfers.mockResolvedValue(undefined);
  });

  it('stores the pre-dispatch fingerprint without recomputing adjusted media', async () => {
    await recordHistoryEntry('caption', [postedResult()], undefined, {
      bodyHash: 'guard-fingerprint',
    });

    expect(mocks.computePostFingerprint).not.toHaveBeenCalled();
    expect(mocks.addToPostHistory).toHaveBeenCalledWith(
      'caption',
      [postedResult()],
      false,
      expect.objectContaining({ bodyHash: 'guard-fingerprint' }),
    );
  });

  it('keeps a fallback for legacy internal callers without a supplied fingerprint', async () => {
    await recordHistoryEntry('caption', [postedResult()]);

    expect(mocks.computePostFingerprint).toHaveBeenCalledWith('caption', undefined);
    expect(mocks.addToPostHistory).toHaveBeenCalledWith(
      'caption',
      [postedResult()],
      false,
      expect.objectContaining({ bodyHash: 'computed-fingerprint' }),
    );
  });

  it('awaits cleanup for both original and adjusted transfer owners', async () => {
    const original = [attachment('original')];
    const adjusted = [attachment('adjusted')];

    await releasePostAttachments(original, adjusted);

    expect(mocks.releaseAttachmentTransfers).toHaveBeenNthCalledWith(1, adjusted);
    expect(mocks.releaseAttachmentTransfers).toHaveBeenNthCalledWith(2, original);
  });
});

function postedResult(): PostResultMessage {
  return {
    type: 'POST_RESULT',
    platform: 'x',
    success: true,
    confirmed: true,
    url: 'https://x.com/example/status/1',
  };
}

function attachment(dataRef: string): ImageAttachment {
  return {
    name: `${dataRef}.png`,
    type: 'image/png',
    dataRef,
  };
}
