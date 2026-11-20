export interface RealPostLedgerEntry {
  platform: string;
  at: number;
  label?: string;
}

export interface RealPostLimits {
  maxPerDay: number;
  minIntervalMs: number;
}

export interface RealPostBudgetViolation {
  platform: string;
  used: number;
  planned: number;
  max: number;
}

export const MAX_POSTS_PER_DAY: number;
export const MIN_INTERVAL_MS: number;
export const ALLOW_BURST_FLAG: string;
export const DEFAULT_LIMITS: Readonly<RealPostLimits>;

export function defaultLedgerPath(env?: Record<string, string | undefined>): string;
export function postsInLastDay(
  ledger: RealPostLedgerEntry[],
  platform: string,
  now: number,
): RealPostLedgerEntry[];
export function findBudgetViolations(
  ledger: RealPostLedgerEntry[],
  planned: Record<string, number>,
  now: number,
  limits?: RealPostLimits,
): RealPostBudgetViolation[];
export function nextAllowedAt(
  ledger: RealPostLedgerEntry[],
  platform: string,
  now: number,
  limits?: RealPostLimits,
): number;
export function formatViolations(violations: RealPostBudgetViolation[]): string;

export interface RealPostGuard {
  ledgerPath: string;
  allowBurst: boolean;
  assertBudget(planned: Record<string, number>): Promise<void>;
  beforePost(platforms: string[], label?: string): Promise<void>;
}

export function createRealPostGuard(options?: {
  ledgerPath?: string;
  limits?: RealPostLimits;
  allowBurst?: boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}): RealPostGuard;

export function guardRealPostRequest(
  platforms: string[],
  label: string,
  options?: { argv?: string[] },
): Promise<void>;
