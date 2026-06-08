import { describe, expect, it } from 'vitest';
import type { PlatformId } from '../messages';
import { DEFAULT_SELECTED_PLATFORMS } from './platforms';
import {
  applyPresetSelection,
  createPresetFromSelection,
  removePresetById,
  selectedPlatformIds,
} from './presets';

describe('popup presets', () => {
  it('derives selected platform ids from the selection map', () => {
    expect(selectedPlatformIds({
      ...emptySelection(),
      x: true,
      bluesky: true,
    })).toEqual(['x', 'bluesky']);
  });

  it('applies a preset without mutating the current selection', () => {
    const current = { ...DEFAULT_SELECTED_PLATFORMS };
    const next = applyPresetSelection(current, {
      id: 'p1',
      name: 'Art',
      platforms: ['pixiv', 'deviantart'],
    });

    expect(next.pixiv).toBe(true);
    expect(next.deviantart).toBe(true);
    expect(next.x).toBe(false);
    expect(current.x).toBe(true);
  });

  it('creates and removes presets', () => {
    const preset = createPresetFromSelection({
      ...emptySelection(),
      tumblr: true,
    }, '  Long name that will be trimmed at thirty chars  ', 'abc');

    expect(preset).toEqual({
      id: 'abc',
      name: 'Long name that will be trimmed',
      platforms: ['tumblr'],
    });
    expect(removePresetById([preset!], 'abc')).toEqual([]);
  });

  it('does not create empty presets', () => {
    expect(createPresetFromSelection(emptySelection(), 'empty')).toBeNull();
    expect(createPresetFromSelection({ ...emptySelection(), x: true }, '   ')).toBeNull();
  });
});

function emptySelection(): Record<PlatformId, boolean> {
  return Object.fromEntries(
    Object.keys(DEFAULT_SELECTED_PLATFORMS).map((id) => [id, false]),
  ) as Record<PlatformId, boolean>;
}
