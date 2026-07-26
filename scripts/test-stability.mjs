#!/usr/bin/env node

/**
 * Opt-in high-risk test stability gate.
 *
 * Usage:
 *   npm run test:stability
 *   npm run test:stability -- 5
 *   npm run test:stability -- 3 src/background
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vitestCli = resolve(repoRoot, 'node_modules', 'vitest', 'vitest.mjs');
const { repeat, vitestArgs } = parseArguments(process.argv.slice(2));
const runId = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${process.pid}`;
const artifactRoot = resolve(repoRoot, '.tmp', 'test-stability');
const runArtifactDir = resolve(artifactRoot, runId);

mkdirSync(runArtifactDir, { recursive: true });
console.log(`[test:stability] repeat=${repeat}`);
console.log(`[test:stability] artifacts=${toRepoPath(runArtifactDir)}`);
if (vitestArgs.length) {
  console.log(`[test:stability] vitest filters=${vitestArgs.join(' ')}`);
}

const completedRuns = [];
for (let iteration = 1; iteration <= repeat; iteration += 1) {
  const reportPath = resolve(
    runArtifactDir,
    `run-${String(iteration).padStart(2, '0')}.json`,
  );
  console.log(`\n[test:stability] run ${iteration}/${repeat}`);
  const result = spawnSync(process.execPath, [
    vitestCli,
    'run',
    ...vitestArgs,
    '--reporter=default',
    '--reporter=json',
    `--outputFile=${reportPath}`,
  ], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
  const exitCode = result.status ?? 1;
  const report = readReport(reportPath);
  const failedTests = extractFailedTests(report);
  completedRuns.push({
    iteration,
    exitCode,
    reportPath: toRepoPath(reportPath),
    failedTests,
  });

  if (result.error || exitCode !== 0) {
    const failureSummary = {
      runId,
      repeat,
      iteration,
      exitCode,
      processError: result.error?.message,
      reportPath: toRepoPath(reportPath),
      failedTests,
    };
    const summaryPath = resolve(artifactRoot, 'last-failure.json');
    writeJson(summaryPath, failureSummary);
    console.error(`\n[test:stability] FAIL; summary=${toRepoPath(summaryPath)}`);
    for (const failedTest of failedTests) {
      console.error(`  - ${failedTest.file}: ${failedTest.name}`);
    }
    process.exit(exitCode);
  }
}

const successSummaryPath = resolve(artifactRoot, 'last-success.json');
writeJson(successSummaryPath, {
  runId,
  repeat,
  vitestArgs,
  completedRuns,
});
console.log(`\n[test:stability] PASS ${repeat}/${repeat}`);
console.log(`[test:stability] summary=${toRepoPath(successSummaryPath)}`);

function parseArguments(args) {
  let repeatValue;
  const remaining = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--repeat') {
      repeatValue = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--repeat=')) {
      repeatValue = arg.slice('--repeat='.length);
      continue;
    }
    if (repeatValue === undefined && /^\d+$/.test(arg)) {
      repeatValue = arg;
      continue;
    }
    remaining.push(arg);
  }
  const parsedRepeat = Number(repeatValue ?? 5);
  if (!Number.isInteger(parsedRepeat) || parsedRepeat < 1 || parsedRepeat > 20) {
    throw new Error('repeat must be an integer from 1 to 20');
  }
  return { repeat: parsedRepeat, vitestArgs: remaining };
}

function readReport(reportPath) {
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    return undefined;
  }
}

function extractFailedTests(report) {
  if (!report?.testResults || !Array.isArray(report.testResults)) return [];
  return report.testResults.flatMap((testFile) => (
    Array.isArray(testFile.assertionResults)
      ? testFile.assertionResults
        .filter((assertion) => assertion.status === 'failed')
        .map((assertion) => ({
          file: toRepoPath(testFile.name),
          name: assertion.fullName || assertion.title || '<unnamed test>',
          failureMessages: assertion.failureMessages ?? [],
        }))
      : []
  ));
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function toRepoPath(file) {
  return relative(repoRoot, file).replaceAll('\\', '/');
}
