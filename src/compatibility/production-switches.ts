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

export const PRODUCTION_COMPATIBILITY_SWITCHES = [] as const satisfies readonly ProductionCompatibilitySwitch[];
