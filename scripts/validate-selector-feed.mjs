#!/usr/bin/env node

/**
 * Validate a selectors.json file through the same TypeScript validator used by
 * client contract tests.
 *
 * Usage:
 *   npm run selectors:validate -- path/to/selectors.json
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: npm run selectors:validate -- path/to/selectors.json');
  process.exit(2);
}

const feedPath = resolve(repoRoot, inputPath);
if (!existsSync(feedPath)) {
  console.error(`Selector feed not found: ${feedPath}`);
  process.exit(2);
}

const vitestCli = resolve(repoRoot, 'node_modules', 'vitest', 'vitest.mjs');
const result = spawnSync(process.execPath, [
  vitestCli,
  'run',
  'tests/selector-feed-file.test.ts',
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    SELECTOR_FEED_PATH: feedPath,
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
