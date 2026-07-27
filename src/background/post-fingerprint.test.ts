import { describe, expect, it, vi } from 'vitest';
import type { ImageAttachment } from '../messages';
import { computeBodyHash, sha256Hex } from '../utils/body-hash';
import { computePostFingerprint } from './post-fingerprint';

describe('computePostFingerprint', () => {
  it('includes attachment bytes and matches the canonical body hash', async () => {
    const first = attachment('first.png', 'first');
    const second = attachment('second.png', 'second');
    const resolveBytes = vi.fn(async (item: ImageAttachment) => (
      new TextEncoder().encode(item.data)
    ));

    const fingerprint = await computePostFingerprint(
      'caption',
      [first, second],
      resolveBytes,
    );

    await expect(computeBodyHash('caption', [
      await sha256Hex(new TextEncoder().encode('first')),
      await sha256Hex(new TextEncoder().encode('second')),
    ])).resolves.toBe(fingerprint);
    expect(resolveBytes).toHaveBeenCalledTimes(2);
  });

  it('is independent of attachment order and transport metadata', async () => {
    const resolveBytes = async (item: ImageAttachment) => (
      new TextEncoder().encode(item.alt)
    );
    const a = { ...attachment('a.png', 'wire-a'), alt: 'same-a' };
    const b = { ...attachment('b.png', 'wire-b'), alt: 'same-b' };
    const renamedA = { ...a, name: 'renamed.png', data: undefined, dataRef: 'ref-a' };

    await expect(computePostFingerprint('caption', [a, b], resolveBytes)).resolves.toBe(
      await computePostFingerprint('caption', [b, renamedA], resolveBytes),
    );
  });

  it('changes when attachment bytes change', async () => {
    const resolveBytes = async (item: ImageAttachment) => (
      new TextEncoder().encode(item.data)
    );

    await expect(computePostFingerprint(
      'caption',
      [attachment('same.png', 'one')],
      resolveBytes,
    )).resolves.not.toBe(await computePostFingerprint(
      'caption',
      [attachment('same.png', 'two')],
      resolveBytes,
    ));
  });
});

function attachment(name: string, data: string): ImageAttachment {
  return { name, type: 'image/png', data };
}
