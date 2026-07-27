import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertArchitectureGuard } from './architecture-guard';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(resolve(repoRoot, 'scripts/catalog.json'), 'utf8')) as {
  entries: Array<{ path: string; class: string }>;
};
const maintainedClasses = new Set(['supported-cli', 'e2e', 'release-gate']);
const cdpMarker =
  /\bE2E_CDP(?:_WS)?\b|connectOverCDP|puppeteer\.connect|browserURL|browserWSEndpoint|webSocketDebuggerUrl|json\/(?:list|version)/;

describe('maintained script CDP architecture', () => {
  it('routes maintained CDP scripts through the shared harness', () => {
    const violations: string[] = [];
    for (const entry of catalog.entries) {
      if (!maintainedClasses.has(entry.class) || entry.path === 'scripts/e2e/cdp-harness.mjs') {
        continue;
      }
      const source = readFileSync(resolve(repoRoot, entry.path), 'utf8');
      if (cdpMarker.test(source) && !source.includes('cdp-harness.mjs')) {
        violations.push(`${entry.path}: CDP marker without shared harness import`);
      }
      if (/\b(?:chromium\.connectOverCDP|puppeteer\.connect)\s*\(/.test(source)) {
        violations.push(`${entry.path}: direct browser CDP attach`);
      }
      if (/dophemlpjldcejjdjefpjbgngodopkfe|klmldcimakkjhlbckpkobjdbpnldkikn/.test(source)) {
        violations.push(`${entry.path}: fixed extension ID`);
      }
    }
    assertArchitectureGuard({
      guard: 'maintained-script-cdp-harness',
      violations,
    });
  });

  it('covers all three maintained CDP script classes', () => {
    const covered = new Set(
      catalog.entries
        .filter((entry) => maintainedClasses.has(entry.class))
        .filter((entry) => cdpMarker.test(readFileSync(resolve(repoRoot, entry.path), 'utf8')))
        .map((entry) => entry.class),
    );
    expect([...covered].sort()).toEqual(['e2e', 'release-gate', 'supported-cli']);
  });
});
