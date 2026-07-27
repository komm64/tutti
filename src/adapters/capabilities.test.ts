import { describe, expect, it } from 'vitest';
import { adapters, checkVideoConstraint } from './registry';
import type { PlatformAdapter } from './types';

const REGISTERED_ADAPTERS = Object.values(adapters)
  .filter((adapter): adapter is PlatformAdapter => adapter !== undefined);

const VIDEO_ADAPTERS = REGISTERED_ADAPTERS
  .filter((adapter) => adapter.kinds.includes('shortVideo') || adapter.kinds.includes('longVideo'));

const IMAGE_ONLY_ADAPTERS = REGISTERED_ADAPTERS
  .filter((adapter) => !adapter.kinds.includes('shortVideo') && !adapter.kinds.includes('longVideo'));

describe('adapter capability matrix', () => {
  it('declares at least one unique content kind for every adapter', () => {
    for (const adapter of REGISTERED_ADAPTERS) {
      expect(adapter.kinds.length, adapter.id).toBeGreaterThan(0);
      expect(new Set(adapter.kinds).size, adapter.id).toBe(adapter.kinds.length);
    }
  });

  it('keeps video constraints present only for video-capable platforms', () => {
    for (const adapter of REGISTERED_ADAPTERS) {
      const supportsVideo = adapter.kinds.includes('shortVideo') || adapter.kinds.includes('longVideo');
      expect(!!adapter.videoConstraints, adapter.id).toBe(supportsVideo);
    }
  });

  it('accepts a normal 30s video on every video-capable platform', () => {
    for (const adapter of VIDEO_ADAPTERS) {
      expect(checkVideoConstraint(adapter.id, 30, 10 * 1024 * 1024), adapter.id).toBeNull();
    }
  });

  it('rejects video on image-only platforms', () => {
    for (const adapter of IMAGE_ONLY_ADAPTERS) {
      expect(checkVideoConstraint(adapter.id, 30, 10 * 1024 * 1024), adapter.id).toContain('未対応');
    }
  });
});
