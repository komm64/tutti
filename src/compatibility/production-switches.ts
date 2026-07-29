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

export const PRODUCTION_COMPATIBILITY_SWITCHES = [
  {
    id: 'legacy-post-orchestrator',
    scope: 'post-orchestrator',
    owner: 'Issue #152',
    introducedVersion: '0.5.50',
    removalVersion: '0.5.52',
    defaultPath: 'next',
  },
] as const satisfies readonly ProductionCompatibilitySwitch[];
