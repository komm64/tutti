/**
 * Create the Chrome Web Store upload ZIP from the already patched WXT output.
 *
 * `wxt zip` rebuilds internally before zipping, which can reintroduce generated
 * dependency worker content before our remote-code patch runs. This script zips
 * `.output/chrome-mv3` after `npm run build` has patched it.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const sourceDir = resolve(root, '.output/chrome-mv3');
const zipPath = resolve(root, `.output/${packageJson.name}-${packageJson.version}-chrome.zip`);

if (!existsSync(sourceDir)) {
  console.error(`[zip-extension] missing output dir: ${sourceDir}`);
  process.exit(1);
}

mkdirSync(dirname(zipPath), { recursive: true });

const result = spawnSync(
  'powershell',
  [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${sourceDir.replaceAll("'", "''")}\\*' -DestinationPath '${zipPath.replaceAll("'", "''")}' -Force`,
  ],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`[zip-extension] wrote ${zipPath}`);
