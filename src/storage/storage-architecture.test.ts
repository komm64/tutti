import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertArchitectureGuard } from '../../tests/architecture-guard';

const STORAGE_MODULES = [
  'draft',
  'history',
  'interactions',
  'platform-users',
  'settings',
] as const;

const EXPECTED_EXPORTS = [
  'Draft',
  'DraftMedia',
  'HistoryEntry',
  'HistoryPlatformResult',
  'InteractionSnapshot',
  'LastSeenUsers',
  'RESPONSIBLE_USE_ACK_VERSION',
  'SelectedPlatforms',
  'Settings',
  'TERMS_URL',
  'addToPostHistory',
  'clearDraft',
  'clearPostHistory',
  'getDraft',
  'getInteractionSnapshots',
  'getLastSeenUsers',
  'getPostHistory',
  'getSelectedPlatforms',
  'getSettings',
  'pruneInteractionSnapshots',
  'removeHistoryEntry',
  'saveDraft',
  'saveSelectedPlatforms',
  'saveSettings',
  'setInteractionSnapshots',
  'setLastSeenUser',
] as const;

describe('storage architecture', () => {
  it('keeps src/storage.ts as a compatibility-only facade', () => {
    const facade = readFileSync('src/storage.ts', 'utf8');

    expect(facade).not.toMatch(
      /\bexport\s+(?:interface|type|const|class|enum|function|async\s+function)\b/,
    );
    for (const module of STORAGE_MODULES) {
      expect(facade).toContain(`export * from './storage/${module}';`);
    }
  });

  it('owns every compatibility export in exactly one responsibility module', () => {
    const owners = new Map<string, string[]>();
    const exportPattern =
      /\bexport\s+(?:interface|type|const|function|async\s+function)\s+([A-Za-z0-9_]+)/g;
    for (const module of STORAGE_MODULES) {
      const source = readFileSync(`src/storage/${module}.ts`, 'utf8');
      for (const match of source.matchAll(exportPattern)) {
        const name = match[1]!;
        owners.set(name, [...(owners.get(name) ?? []), module]);
      }
      expect(source).not.toMatch(/from\s+['"]\.\.\/storage['"]/);
    }

    const duplicates = [...owners.entries()]
      .filter(([, modules]) => modules.length !== 1)
      .map(([name, modules]) => `${name}: ${modules.join(',')}`);
    const actualExports = new Set(owners.keys());
    const expectedExports = new Set<string>(EXPECTED_EXPORTS);
    assertArchitectureGuard({
      guard: 'storage-export-ownership',
      violations: [
        ...duplicates,
        ...[...expectedExports]
          .filter((name) => !actualExports.has(name))
          .map((name) => `missing compatibility export: ${name}`),
        ...[...actualExports]
          .filter((name) => !expectedExports.has(name))
          .map((name) => `unexpected compatibility export: ${name}`),
      ],
    });
  });
});
