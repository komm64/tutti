export function formatSurfaceMatrixOutcome(failures) {
  if (failures.length === 0) {
    return {
      passed: true,
      exitCode: 0,
      stdout: ['\n[matrix] PASS'],
      stderr: [],
    };
  }
  return {
    passed: false,
    exitCode: 1,
    stdout: [],
    stderr: [
      '\n[matrix] FAIL',
      ...failures.map((failure) => `  - ${failure}`),
    ],
  };
}
