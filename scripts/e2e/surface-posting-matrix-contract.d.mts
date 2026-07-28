export interface SurfaceMatrixOutcome {
  passed: boolean;
  exitCode: 0 | 1;
  stdout: string[];
  stderr: string[];
}

export function formatSurfaceMatrixOutcome(
  failures: readonly string[],
): SurfaceMatrixOutcome;

export function validateSurfaceResultContract(input: {
  mode: 'preview' | 'post';
  caseName: string;
  platform: string;
  result?: {
    success?: boolean;
    preview?: boolean;
    confirmed?: boolean;
    implementation?: {
      revision?: number;
      path?: 'next' | 'legacy';
    };
    url?: string;
    error?: string;
    flow?: {
      submitReached?: boolean;
      lastCompletedStep?: string;
      failedStep?: string;
    };
    verify?: {
      issues?: Array<{ severity?: string }>;
    };
  };
}): string[];

export function createTimedOutSurfaceSummary(input: {
  caseName: string;
  iteration: number;
  platforms: string[];
  error: string;
  backgroundState: {
    posting?: boolean;
    postingState?: {
      platforms?: string[];
      pending?: string[];
      done?: boolean;
      results?: Array<{ platform?: string; [key: string]: unknown }>;
    } | null;
    error?: string;
  };
}): {
  caseName: string;
  iteration: number;
  platforms: string[];
  timedOut: true;
  error: string;
  results: Array<{ platform?: string; [key: string]: unknown }>;
  completedPlatforms: string[];
  pendingPlatforms: string[];
  backgroundState: object;
};
