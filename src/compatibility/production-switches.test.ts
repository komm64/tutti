import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertArchitectureGuard } from '../../tests/architecture-guard';
import {
  PRODUCTION_COMPATIBILITY_SWITCHES,
  type ProductionCompatibilitySwitch,
} from './production-switches';

const packageVersion = (
  JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
).version;

describe('production compatibility switch policy', () => {
  it('keeps rejected Phase 6 scopes out of the production registry', () => {
    expect(PRODUCTION_COMPATIBILITY_SWITCHES).toEqual([]);
  });

  it('guards metadata, uniqueness, default path, and removal version', () => {
    assertArchitectureGuard({
      guard: 'production-compatibility-switches',
      violations: compatibilitySwitchViolations(
        PRODUCTION_COMPATIBILITY_SWITCHES,
        packageVersion,
      ),
    });
  });

  it('detects an expired or unsafe synthetic switch', () => {
    const invalid = {
      id: 'legacy-page-hook',
      scope: 'page-injection',
      owner: 'Issue #88',
      introducedVersion: '0.5.40',
      removalVersion: '0.5.49',
      defaultPath: 'legacy',
    } as unknown as ProductionCompatibilitySwitch;

    expect(compatibilitySwitchViolations([invalid], '0.5.49')).toEqual([
      'legacy-page-hook: defaultPath must be next',
      'legacy-page-hook: removalVersion 0.5.49 reached at 0.5.49',
    ]);
  });
});

function compatibilitySwitchViolations(
  switches: readonly ProductionCompatibilitySwitch[],
  currentVersion: string,
): string[] {
  const violations: string[] = [];
  const ids = new Set<string>();
  const scopes = new Set<string>();

  for (const entry of switches) {
    if (!entry.id.trim()) violations.push('(empty id): id is required');
    if (ids.has(entry.id)) violations.push(`${entry.id}: duplicate id`);
    ids.add(entry.id);

    if (scopes.has(entry.scope)) {
      violations.push(`${entry.id}: duplicate active scope ${entry.scope}`);
    }
    scopes.add(entry.scope);

    if (!/^Issue #\d+$/.test(entry.owner)) {
      violations.push(`${entry.id}: owner must be Issue #<number>`);
    }
    if (entry.defaultPath !== 'next') {
      violations.push(`${entry.id}: defaultPath must be next`);
    }

    const introduced = parseVersion(entry.introducedVersion);
    const removal = parseVersion(entry.removalVersion);
    const current = parseVersion(currentVersion);
    if (!introduced) {
      violations.push(`${entry.id}: invalid introducedVersion ${entry.introducedVersion}`);
    }
    if (!removal) {
      violations.push(`${entry.id}: invalid removalVersion ${entry.removalVersion}`);
    }
    if (!current) {
      violations.push(`package: invalid current version ${currentVersion}`);
    }
    if (introduced && removal && compareVersion(introduced, removal) >= 0) {
      violations.push(
        `${entry.id}: removalVersion must be later than introducedVersion`,
      );
    }
    if (current && removal && compareVersion(current, removal) >= 0) {
      violations.push(
        `${entry.id}: removalVersion ${entry.removalVersion} reached at ${currentVersion}`,
      );
    }
  }

  return violations.sort();
}

type ParsedVersion = readonly [number, number, number];

function parseVersion(version: string): ParsedVersion | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : null;
}

function compareVersion(left: ParsedVersion, right: ParsedVersion): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}
