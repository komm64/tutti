import { describe, expect, it } from 'vitest';
import { buildDraftKey } from './draft-key';

describe('buildDraftKey', () => {
  it('changes when draft media changes', () => {
    const base = {
      text: 'hello',
      selectedIds: ['x' as const],
      images: [],
      video: null,
      imageAlts: [],
      cw: '',
      visibility: 'public' as const,
      trimToS: null,
      autoPost: true,
    };
    const withVideo = {
      ...base,
      video: {
        name: 'clip.mp4',
        type: 'video/mp4',
        data: 'AAAA',
        previewUrl: 'blob:test',
        durationS: 12,
      },
    };

    expect(buildDraftKey(base)).not.toBe(buildDraftKey(withVideo));
  });
});
