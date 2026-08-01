import { describe, expect, it } from 'vitest';
import { resolveXOwnHandle } from './x-user';

describe('resolveXOwnHandle', () => {
  it('prefers the handle detected in the current X document', () => {
    expect(resolveXOwnHandle('@current_user', '@stored_user')).toBe('current_user');
  });

  it('uses the pre-dispatch account when compact X hides the side navigation', () => {
    expect(resolveXOwnHandle(null, '@stored_user')).toBe('stored_user');
  });

  it('rejects values that are unsafe for X status URL matching', () => {
    expect(resolveXOwnHandle(null, '@bad/user')).toBeUndefined();
    expect(resolveXOwnHandle(null, '@handle_that_is_too_long')).toBeUndefined();
  });
});
