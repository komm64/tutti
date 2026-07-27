export interface SurfaceMatrixOutcome {
  passed: boolean;
  exitCode: 0 | 1;
  stdout: string[];
  stderr: string[];
}

export function formatSurfaceMatrixOutcome(
  failures: readonly string[],
): SurfaceMatrixOutcome;
