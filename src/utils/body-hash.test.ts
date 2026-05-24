import { describe, expect, it } from 'vitest';
import { computeBodyHash, sha256Hex } from './body-hash';

describe('sha256Hex', () => {
  it('hashes empty string to known constant', async () => {
    // SHA-256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('hashes "abc" to known constant', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes Uint8Array equivalently to string', async () => {
    const fromString = await sha256Hex('hello');
    const fromBytes = await sha256Hex(new TextEncoder().encode('hello'));
    expect(fromString).toBe(fromBytes);
  });
});

describe('computeBodyHash', () => {
  it('hashes text-only payload (no media)', async () => {
    const h = await computeBodyHash('hello world');
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic for same text + media set', async () => {
    const h1 = await computeBodyHash('post', ['aaa', 'bbb']);
    const h2 = await computeBodyHash('post', ['aaa', 'bbb']);
    expect(h1).toBe(h2);
  });

  it('is order-independent for media digests (sort applied)', async () => {
    const h1 = await computeBodyHash('post', ['aaa', 'bbb']);
    const h2 = await computeBodyHash('post', ['bbb', 'aaa']);
    expect(h1).toBe(h2);
  });

  it('differs when text changes', async () => {
    const h1 = await computeBodyHash('post A');
    const h2 = await computeBodyHash('post B');
    expect(h1).not.toBe(h2);
  });

  it('differs when media set changes', async () => {
    const h1 = await computeBodyHash('same text', ['aaa']);
    const h2 = await computeBodyHash('same text', ['aaa', 'bbb']);
    expect(h1).not.toBe(h2);
  });

  it('text-only result differs from text+empty-media-array', async () => {
    // both should resolve to the same payload since [] adds no separator
    const a = await computeBodyHash('hi');
    const b = await computeBodyHash('hi', []);
    expect(a).toBe(b);
  });
});
