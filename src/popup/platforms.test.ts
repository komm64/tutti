import { describe, expect, it } from 'vitest';
import { DEFAULT_SELECTED_PLATFORMS, POPUP_PLATFORMS, resolveTuttiContext } from './platforms';

describe('resolveTuttiContext', () => {
  it('detects sidepanel, floating, and popup contexts', () => {
    expect(resolveTuttiContext('/sidepanel.html', '')).toBe('sidepanel');
    expect(resolveTuttiContext('/popup.html', '?floating=1')).toBe('floating');
    expect(resolveTuttiContext('/popup.html', '')).toBe('popup');
  });
});

describe('popup platform defaults', () => {
  it('has a selected flag for every platform', () => {
    expect(Object.keys(DEFAULT_SELECTED_PLATFORMS).sort()).toEqual(POPUP_PLATFORMS.map((p) => p.id).sort());
  });
});
