import type { PlatformId } from '../messages';
import type { SnsPreset } from './types';

export function selectedPlatformIds(selected: Record<PlatformId, boolean>): PlatformId[] {
  return (Object.entries(selected) as [PlatformId, boolean][])
    .filter(([, value]) => value)
    .map(([id]) => id);
}

export function applyPresetSelection(
  current: Record<PlatformId, boolean>,
  preset: SnsPreset,
): Record<PlatformId, boolean> {
  const next = { ...current };
  for (const id of Object.keys(next) as PlatformId[]) {
    next[id] = preset.platforms.includes(id);
  }
  return next;
}

export function createPresetFromSelection(
  selected: Record<PlatformId, boolean>,
  name: string,
  id: string = Date.now().toString(36),
): SnsPreset | null {
  const platforms = selectedPlatformIds(selected);
  const normalizedName = name.trim().slice(0, 30);
  if (!normalizedName || platforms.length === 0) return null;
  return { id, name: normalizedName, platforms };
}

export function removePresetById(presets: readonly SnsPreset[], id: string): SnsPreset[] {
  return presets.filter((preset) => preset.id !== id);
}
