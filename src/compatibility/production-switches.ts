export type ProductionCompatibilityScope =
  | 'page-injection'
  | 'post-orchestrator';

export interface ProductionCompatibilitySwitch {
  id: string;
  scope: ProductionCompatibilityScope;
  owner: `Issue #${number}`;
  introducedVersion: `${number}.${number}.${number}`;
  removalVersion: `${number}.${number}.${number}`;
  defaultPath: 'next';
}

/**
 * Production compatibility switches are exceptional and temporary. Phase 6
 * rejected switches for both currently planned scopes, so this registry is
 * intentionally empty. Development-only comparison paths do not belong here.
 */
export const PRODUCTION_COMPATIBILITY_SWITCHES = [
] as const satisfies readonly ProductionCompatibilitySwitch[];
