import { describe, expect, it } from 'vitest';
import {
  assertArchitectureGuard,
  type TemporaryArchitectureAllowance,
} from './architecture-guard';

const validAllowance: TemporaryArchitectureAllowance = {
  fingerprint: 'src/example.ts:12: temporary dependency',
  reason: 'Migration remains active until the owning slice lands.',
  owner: 'Issue #86',
  expiresOn: '2026-08-31',
};

describe('architecture guard policy', () => {
  it('accepts a current exact allowance', () => {
    expect(() => assertArchitectureGuard({
      guard: 'example',
      violations: [validAllowance.fingerprint],
      allowances: [validAllowance],
      today: '2026-07-28',
    })).not.toThrow();
  });

  it('reports unallowed violations deterministically', () => {
    expect(() => assertArchitectureGuard({
      guard: 'example',
      violations: ['z violation', 'a violation', 'z violation'],
      today: '2026-07-28',
    })).toThrowError(
      '[architecture:example] failed\n'
      + 'violations (2):\n'
      + '- a violation\n'
      + '- z violation',
    );
  });

  it('rejects stale allowances after their violation disappears', () => {
    expect(() => assertArchitectureGuard({
      guard: 'example',
      violations: [],
      allowances: [validAllowance],
      today: '2026-07-28',
    })).toThrowError(/stale allowances \(1\):/);
  });

  it('rejects invalid allowance metadata', () => {
    expect(() => assertArchitectureGuard({
      guard: 'example',
      violations: ['temporary'],
      allowances: [{
        fingerprint: 'temporary',
        reason: 'too short',
        owner: 'team',
        expiresOn: '2026-13-40',
      }],
      today: '2026-07-28',
    })).toThrowError(
      '[architecture:example] failed\n'
      + 'allowance policy (3):\n'
      + '- temporary: expiresOn must be YYYY-MM-DD\n'
      + '- temporary: owner must be "Issue #<number>"\n'
      + '- temporary: reason must be at least 20 characters',
    );
  });

  it('rejects expired allowances', () => {
    expect(() => assertArchitectureGuard({
      guard: 'example',
      violations: [validAllowance.fingerprint],
      allowances: [{ ...validAllowance, expiresOn: '2026-07-27' }],
      today: '2026-07-28',
    })).toThrowError(/expired on 2026-07-27/);
  });
});
