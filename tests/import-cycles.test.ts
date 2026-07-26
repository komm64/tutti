import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoots = ['src', 'entrypoints'].map((directory) => resolve(repoRoot, directory));
const sourceExtensions = new Set(['.ts', '.svelte']);

describe('production import graph', () => {
  it('detects and normalizes a cycle in the graph algorithm', () => {
    const graph = new Map<string, string[]>([
      ['a.ts', ['b.ts']],
      ['b.ts', ['c.ts']],
      ['c.ts', ['a.ts']],
    ]);

    expect(findCycles(graph)).toEqual(['a.ts -> b.ts -> c.ts -> a.ts']);
  });

  it('has no cycles', () => {
    const files = sourceRoots.flatMap(collectSourceFiles).sort();
    const graph = buildImportGraph(files);
    const edgeCount = [...graph.values()].reduce((total, imports) => total + imports.length, 0);
    const cycles = findCycles(graph);

    expect(files.length, 'production source discovery unexpectedly returned too few files')
      .toBeGreaterThan(50);
    expect(edgeCount, 'production import discovery unexpectedly returned too few edges')
      .toBeGreaterThan(50);
    expect(
      cycles,
      cycles.length
        ? `Production import cycles detected:\n${cycles.map((cycle) => `- ${cycle}`).join('\n')}`
        : undefined,
    ).toEqual([]);
  });
});

function collectSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(path));
      continue;
    }
    if (
      entry.isFile()
      && sourceExtensions.has(extname(entry.name))
      && !entry.name.endsWith('.test.ts')
      && !entry.name.endsWith('.d.ts')
      && entry.name !== 'test-setup.ts'
    ) {
      files.push(path);
    }
  }
  return files;
}

function buildImportGraph(files: readonly string[]): Map<string, string[]> {
  const filesByCanonicalPath = new Map(
    files.map((file) => [canonicalPath(file), file] as const),
  );
  const graph = new Map<string, string[]>();

  for (const importer of files) {
    const source = readFileSync(importer, 'utf8');
    const imports = ts.preProcessFile(source, true, true).importedFiles;
    const resolvedImports = new Set<string>();
    for (const imported of imports) {
      const resolvedImport = resolveProductionImport(
        imported.fileName,
        importer,
        filesByCanonicalPath,
      );
      if (resolvedImport) resolvedImports.add(toRepoPath(resolvedImport));
    }
    graph.set(toRepoPath(importer), [...resolvedImports].sort());
  }
  return graph;
}

function resolveProductionImport(
  specifier: string,
  importer: string,
  filesByCanonicalPath: ReadonlyMap<string, string>,
): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const basePath = resolve(dirname(importer), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.svelte`,
    resolve(basePath, 'index.ts'),
    resolve(basePath, 'index.svelte'),
  ];
  for (const candidate of candidates) {
    const productionFile = filesByCanonicalPath.get(canonicalPath(candidate));
    if (productionFile) return productionFile;
  }
  return undefined;
}

function findCycles(graph: ReadonlyMap<string, readonly string[]>): string[] {
  const states = new Map<string, 'visiting' | 'visited'>();
  const stack: string[] = [];
  const cycles = new Set<string>();

  const visit = (node: string): void => {
    states.set(node, 'visiting');
    stack.push(node);
    for (const imported of graph.get(node) ?? []) {
      if (!graph.has(imported)) continue;
      const state = states.get(imported);
      if (state === 'visiting') {
        const start = stack.lastIndexOf(imported);
        cycles.add(canonicalCycle(stack.slice(start)));
      } else if (state !== 'visited') {
        visit(imported);
      }
    }
    stack.pop();
    states.set(node, 'visited');
  };

  for (const node of [...graph.keys()].sort()) {
    if (!states.has(node)) visit(node);
  }
  return [...cycles].sort();
}

function canonicalCycle(nodes: readonly string[]): string {
  const rotations = nodes.map((_, index) => [
    ...nodes.slice(index),
    ...nodes.slice(0, index),
  ]);
  rotations.sort((left, right) => left.join('\0').localeCompare(right.join('\0')));
  const canonical = rotations[0] ?? [];
  return [...canonical, canonical[0]].join(' -> ');
}

function canonicalPath(file: string): string {
  const normalized = resolve(file).replaceAll('\\', '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function toRepoPath(file: string): string {
  return relative(repoRoot, file).replaceAll('\\', '/');
}
