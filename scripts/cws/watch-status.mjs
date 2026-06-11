/**
 * Poll Chrome Web Store status after submitting a new revision.
 *
 * Usage:
 *   node scripts/cws/watch-status.mjs
 *   node scripts/cws/watch-status.mjs --interval-minutes 30
 *   node scripts/cws/watch-status.mjs --version 0.5.30 --max-checks 12
 *
 * Defaults:
 *   - expected version: package.json version
 *   - interval: 30 minutes
 *   - max checks: unlimited
 *
 * The script exits successfully once the expected version is published.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cwsV2Api, getPublisherId, loadEnv, requireEnv } from './_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

function readPackageVersion() {
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
  return pkg.version;
}

function argValue(name) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1];
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function parsePositiveNumber(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Expected positive number, got: ${value}`);
  }
  return n;
}

function revisionVersions(revision) {
  if (!revision?.distributionChannels) return [];
  return revision.distributionChannels
    .map((channel) => channel.crxVersion)
    .filter(Boolean);
}

function summarizeRevision(label, revision) {
  if (!revision) return `${label}: (none)`;
  const versions = revisionVersions(revision);
  const versionText = versions.length > 0 ? versions.join(', ') : '?';
  return `${label}: ${revision.state ?? '(unknown)'} version=${versionText}`;
}

async function fetchStatus(env) {
  const publisherId = getPublisherId(env);
  return await cwsV2Api(
    env,
    `/publishers/${publisherId}/items/${env.CWS_ITEM_ID}:fetchStatus`,
  );
}

function isExpectedVersionPublished(status, expectedVersion) {
  return revisionVersions(status.publishedItemRevisionStatus).includes(expectedVersion);
}

async function main() {
  const env = loadEnv();
  requireEnv(env, 'CWS_ITEM_ID');

  const expectedVersion = argValue('--version') ?? readPackageVersion();
  const intervalMinutes = parsePositiveNumber(
    argValue('--interval-minutes') ?? process.env.CWS_WATCH_INTERVAL_MINUTES,
    30,
  );
  const maxChecks = parsePositiveNumber(argValue('--max-checks'), Number.POSITIVE_INFINITY);
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[cws-watch] expected version: ${expectedVersion}`);
  console.log(`[cws-watch] interval: ${intervalMinutes} minute(s)`);
  console.log(`[cws-watch] max checks: ${Number.isFinite(maxChecks) ? maxChecks : 'unlimited'}`);

  for (let check = 1; check <= maxChecks; check += 1) {
    const now = new Date().toISOString();
    const status = await fetchStatus(env);
    console.log('');
    console.log(`[cws-watch] check #${check} at ${now}`);
    console.log(summarizeRevision('published', status.publishedItemRevisionStatus));
    console.log(summarizeRevision('submitted', status.submittedItemRevisionStatus));
    console.log(`lastAsyncUploadState: ${status.lastAsyncUploadState ?? '(unset)'}`);
    console.log(`takenDown: ${status.takenDown ?? false}`);
    console.log(`warned: ${status.warned ?? false}`);

    if (isExpectedVersionPublished(status, expectedVersion)) {
      console.log('');
      console.log(`[cws-watch] ✓ ${expectedVersion} is published.`);
      return;
    }

    if (check >= maxChecks) break;
    console.log(`[cws-watch] waiting ${intervalMinutes} minute(s) before next check...`);
    await new Promise((resolveSleep) => setTimeout(resolveSleep, intervalMs));
  }

  console.log('');
  console.log(`[cws-watch] ${expectedVersion} is not published yet.`);
  process.exitCode = 2;
}

main().catch((e) => {
  console.error('fatal:', e?.message ?? e);
  process.exit(1);
});
