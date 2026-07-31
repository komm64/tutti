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

export function hasSurfaceVideoPreview(mediaState) {
  return Number.isInteger(mediaState?.videoCount) && mediaState.videoCount > 0;
}

export function validateSurfaceResultContract({
  mode,
  caseName,
  platform,
  result,
  expectedImplementationPath = 'next',
}) {
  const prefix = `${caseName}/${platform}`;
  const failures = [];

  if (!result) return [`${prefix}: missing result`];
  if (
    result.implementation?.path !== expectedImplementationPath
    || !Number.isInteger(result.implementation?.revision)
    || result.implementation.revision < 1
  ) {
    failures.push(
      `${prefix}: missing or invalid ${expectedImplementationPath} implementation diagnostics`,
    );
  }
  if (!result.flow) {
    failures.push(`${prefix}: result missing flow trace`);
  } else if (!result.flow.lastCompletedStep && !result.flow.failedStep) {
    failures.push(`${prefix}: flow trace has no completed or failed step`);
  }
  if (!result.success) {
    failures.push(`${prefix}: success=false (${result.error ?? 'no error message'})`);
    return failures;
  }

  if (mode === 'preview') {
    if (result.preview !== true) failures.push(`${prefix}: preview result missing preview=true`);
    if (result.url) failures.push(`${prefix}: preview returned URL ${result.url}`);
    if (result.flow?.submitReached) failures.push(`${prefix}: preview reached submit action`);
  } else {
    if (result.preview) failures.push(`${prefix}: post result was marked preview`);
    if (!result.confirmed) failures.push(`${prefix}: post result was not confirmed`);
    if (!result.url) failures.push(`${prefix}: post URL was not captured`);
    if (result.flow?.submitReached !== true) {
      failures.push(`${prefix}: post result did not record submitReached=true`);
    }
  }

  if (result.verify?.issues?.some((issue) => issue.severity === 'error')) {
    failures.push(`${prefix}: verify hard error ${JSON.stringify(result.verify.issues)}`);
  }
  return failures;
}

export function createTimedOutSurfaceSummary({
  caseName,
  iteration,
  platforms,
  error,
  backgroundState,
}) {
  const results = backgroundState?.postingState?.results ?? [];
  const completedPlatforms = [...new Set(
    results.map((result) => result.platform).filter(Boolean),
  )];
  return {
    caseName,
    iteration,
    platforms,
    timedOut: true,
    error,
    results,
    completedPlatforms,
    pendingPlatforms: platforms.filter((platform) => !completedPlatforms.includes(platform)),
    backgroundState,
  };
}
