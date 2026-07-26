#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_CLASSES = [
  'probe',
  'supported-cli',
  'release-gate',
  'e2e',
  'diagnostic',
  'obsolete-candidate',
];

const SCRIPT_CLASS_DESCRIPTIONS = {
  probe: 'Exploratory, transient investigation. Retained until human review.',
  'supported-cli': 'Maintained developer/release command or a module it loads.',
  'release-gate': 'Required evidence-producing command in the release workflow.',
  e2e: 'Repeatable end-to-end or browser behavior check.',
  diagnostic: 'Manual inspection, capture, cleanup, or troubleshooting command.',
  'obsolete-candidate': 'Potential cleanup target. Phase 9 still requires human review.',
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(repoRoot, 'scripts', 'catalog.json');
const defaultInventoryPath = join(repoRoot, 'docs', 'generated', 'scripts-inventory.md');

function toRepoPath(filePath) {
  return relative(repoRoot, filePath).replaceAll('\\', '/');
}

function gitLines(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function loadCatalog() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(catalogPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${toRepoPath(catalogPath)}: ${error.message}`);
  }
  return parsed;
}

function discoverMjsFiles() {
  return [
    ...new Set(gitLines([
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      '*.mjs',
    ]).map((file) => file.replaceAll('\\', '/'))),
  ].sort();
}

function validateCatalog(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    return ['catalog root must be an object'];
  }
  for (const key of Object.keys(catalog)) {
    if (!['schemaVersion', 'entries'].includes(key)) {
      errors.push(`catalog root has unknown field "${key}"`);
    }
  }
  if (catalog?.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1');
  }
  if (!Array.isArray(catalog?.entries)) {
    return [...errors, 'entries must be an array'];
  }

  const allowedKeys = new Set(['path', 'class', 'usage', 'entryCommand', 'owner']);
  const catalogPaths = [];
  const seen = new Set();

  for (const [index, entry] of catalog.entries.entries()) {
    const label = entry?.path || `entry[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`entry[${index}] must be an object`);
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (!allowedKeys.has(key)) {
        errors.push(`${label}: unknown field "${key}"`);
      }
    }
    if (typeof entry.path !== 'string' || !entry.path.endsWith('.mjs')) {
      errors.push(`${label}: path must be a repo-relative .mjs path`);
      continue;
    }
    if (
      isAbsolute(entry.path)
      || entry.path.includes('\\')
      || entry.path.split('/').includes('..')
      || posix.normalize(entry.path) !== entry.path
    ) {
      errors.push(`${label}: path must use normalized repo-relative POSIX syntax`);
    }
    if (seen.has(entry.path)) {
      errors.push(`${label}: duplicate catalog entry`);
    }
    seen.add(entry.path);
    catalogPaths.push(entry.path);

    if (!SCRIPT_CLASSES.includes(entry.class)) {
      errors.push(`${label}: unknown class "${entry.class}"`);
    }
    if (typeof entry.usage !== 'string' || !entry.usage.trim()) {
      errors.push(`${label}: usage must be a non-empty string`);
    }
    for (const optionalField of ['entryCommand', 'owner']) {
      if (
        optionalField in entry
        && (typeof entry[optionalField] !== 'string' || !entry[optionalField].trim())
      ) {
        errors.push(`${label}: ${optionalField} must be a non-empty string when present`);
      }
    }
    if (!existsSync(join(repoRoot, entry.path))) {
      errors.push(`${label}: catalog entry points to a missing file`);
    }

    if (
      entry.path.startsWith('scripts/e2e/platforms/')
      && entry.class !== 'supported-cli'
    ) {
      errors.push(`${label}: dynamically imported platform modules must be supported-cli`);
    }
    if (entry.path.startsWith('scripts/cws/') && entry.class !== 'supported-cli') {
      errors.push(`${label}: manual CWS tools must be supported-cli`);
    }
    if (entry.class === 'release-gate' && !entry.owner) {
      errors.push(`${label}: release-gate entries must name an owner`);
    }
  }

  const sortedPaths = [...catalogPaths].sort();
  if (catalogPaths.some((file, index) => file !== sortedPaths[index])) {
    errors.push('catalog entries must be sorted by path');
  }

  const discovered = discoverMjsFiles();
  const discoveredSet = new Set(discovered);
  const catalogSet = new Set(catalogPaths);
  for (const file of discovered) {
    if (!catalogSet.has(file)) {
      errors.push(`${file}: tracked or unignored .mjs file is missing from catalog`);
    }
  }
  for (const file of catalogPaths) {
    if (!discoveredSet.has(file)) {
      errors.push(`${file}: catalog entry is not tracked or present as an unignored file`);
    }
  }
  return errors;
}

function parseClassFilter(args) {
  const equalsArg = args.find((arg) => arg.startsWith('--class='));
  const flagIndex = args.indexOf('--class');
  const positionalArg = args.find((arg) => !arg.startsWith('-'));
  const value = equalsArg?.slice('--class='.length)
    ?? (flagIndex >= 0 ? args[flagIndex + 1] : undefined);
  const classFilter = value ?? positionalArg;
  if (classFilter && !SCRIPT_CLASSES.includes(classFilter)) {
    throw new Error(
      `Unknown class "${classFilter}". Expected one of: ${SCRIPT_CLASSES.join(', ')}`,
    );
  }
  return classFilter;
}

function assertValid(catalog) {
  const errors = validateCatalog(catalog);
  if (errors.length) {
    throw new Error(`Scripts catalog validation failed:\n- ${errors.join('\n- ')}`);
  }
}

function printSummary(entries) {
  console.log(`Scripts catalog: ${entries.length} .mjs files`);
  for (const scriptClass of SCRIPT_CLASSES) {
    const count = entries.filter((entry) => entry.class === scriptClass).length;
    console.log(`  ${scriptClass.padEnd(20)} ${String(count).padStart(3)}`);
  }
}

function listCatalog(catalog, args) {
  assertValid(catalog);
  const classFilter = parseClassFilter(args);
  const entries = classFilter
    ? catalog.entries.filter((entry) => entry.class === classFilter)
    : catalog.entries;
  printSummary(catalog.entries);
  if (classFilter) {
    console.log(`\nFilter: ${classFilter} (${entries.length})`);
  }
  console.log('');
  for (const entry of entries) {
    const command = entry.entryCommand ? ` | ${entry.entryCommand}` : '';
    console.log(`${entry.class.padEnd(20)} ${entry.path}${command}`);
    console.log(`${' '.repeat(21)}${entry.usage}`);
  }
}

function getReferenceFiles() {
  return gitLines([
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
  ]).filter((file) => (
    file === 'package.json'
    || file.endsWith('.md')
    || (file.startsWith('.github/') && /\.(?:yml|yaml|json)$/.test(file))
  ) && file !== toRepoPath(defaultInventoryPath));
}

function addMapValue(map, key, value) {
  const values = map.get(key) ?? [];
  if (!values.includes(value)) {
    values.push(value);
    map.set(key, values);
  }
}

function collectDocumentReferences(catalogPaths) {
  const references = new Map();
  const knownPaths = new Set(catalogPaths);
  const scriptPathPattern = /scripts\/[A-Za-z0-9_./-]+\.mjs/g;
  for (const referenceFile of getReferenceFiles()) {
    const lines = readFileSync(join(repoRoot, referenceFile), 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(scriptPathPattern)) {
        if (knownPaths.has(match[0])) {
          addMapValue(references, match[0], `${referenceFile}:${index + 1}`);
        }
      }
    });
  }
  return references;
}

function collectModuleReferences(catalogPaths) {
  const references = new Map();
  const dynamicPatterns = [];
  const knownPaths = new Set(catalogPaths);
  const specifierPattern = /(?:from\s+|import\s*\(\s*|import\s+)(['"])([^'"]+\.mjs)\1/g;
  for (const importer of catalogPaths) {
    const lines = readFileSync(join(repoRoot, importer), 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(specifierPattern)) {
        if (!match[2].startsWith('.')) continue;
        const imported = posix.normalize(posix.join(posix.dirname(importer), match[2]));
        if (knownPaths.has(imported)) {
          addMapValue(references, imported, `${importer}:${index + 1}`);
        }
      }
      if (/import\s*\(\s*`[^`]*\$\{/.test(line)) {
        dynamicPatterns.push({
          importer,
          line: index + 1,
          pattern: line.trim(),
        });
      }
    });
  }
  return { references, dynamicPatterns };
}

function collectInFileUsage(catalogPaths) {
  const usage = new Map();
  const pattern = /\bUsage\s*:|使い方|(?:^|\s)Run:|node scripts\//i;
  for (const file of catalogPaths) {
    const lines = readFileSync(join(repoRoot, file), 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (pattern.test(line) && (usage.get(file)?.length ?? 0) < 3) {
        addMapValue(usage, file, `${index + 1}: ${line.trim()}`);
      }
    });
  }
  return usage;
}

function collectLastChanges(catalogPaths) {
  const knownPaths = new Set(catalogPaths);
  const changes = new Map();
  const output = execFileSync(
    'git',
    ['-c', 'core.quotepath=false', 'log', '--format=--SCRIPT-COMMIT--%cs%x09%h', '--name-only', '--', '*.mjs'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  let current = '';
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('--SCRIPT-COMMIT--')) {
      current = line.slice('--SCRIPT-COMMIT--'.length);
      continue;
    }
    const file = line.replaceAll('\\', '/');
    if (current && knownPaths.has(file) && !changes.has(file)) {
      changes.set(file, current.replace('\t', ' @ '));
    }
  }
  return changes;
}

function escapeMarkdown(value) {
  return String(value)
    .replaceAll('|', '\\|')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ')
    .replaceAll('`', "'");
}

function compactList(values, limit = 4) {
  if (!values?.length) return '—';
  const visible = values.slice(0, limit);
  const rest = values.length - visible.length;
  return `${visible.join('<br>')}${rest > 0 ? `<br>+${rest} more` : ''}`;
}

function buildInventory(catalog) {
  assertValid(catalog);
  const paths = catalog.entries.map((entry) => entry.path);
  const documentReferences = collectDocumentReferences(paths);
  const { references: moduleReferences, dynamicPatterns } = collectModuleReferences(paths);
  const inFileUsage = collectInFileUsage(paths);
  const lastChanges = collectLastChanges(paths);
  const lines = [
    '# Scripts inventory',
    '',
    '> Generated by `npm run scripts:inventory` from `scripts/catalog.json`.',
    '> Reachability is evidence for human review, not permission to delete a script.',
    '',
    `Cataloged tracked/unignored \`.mjs\` files: **${catalog.entries.length}**`,
    '',
    '## Classification contract',
    '',
    '| Class | Count | Meaning |',
    '| --- | ---: | --- |',
  ];

  for (const scriptClass of SCRIPT_CLASSES) {
    const count = catalog.entries.filter((entry) => entry.class === scriptClass).length;
    lines.push(
      `| \`${scriptClass}\` | ${count} | ${escapeMarkdown(SCRIPT_CLASS_DESCRIPTIONS[scriptClass])} |`,
    );
  }

  lines.push('', '## Dynamic import patterns', '');
  if (dynamicPatterns.length) {
    lines.push('| Importer | Pattern |', '| --- | --- |');
    for (const item of dynamicPatterns) {
      lines.push(
        `| \`${item.importer}:${item.line}\` | \`${escapeMarkdown(item.pattern)}\` |`,
      );
    }
  } else {
    lines.push('None found.');
  }

  for (const scriptClass of SCRIPT_CLASSES) {
    const entries = catalog.entries.filter((entry) => entry.class === scriptClass);
    lines.push(
      '',
      `## ${scriptClass} (${entries.length})`,
      '',
      '| Path | Catalog usage / entry | Package, docs, workflow, Surface/CWS refs | Static module importers | In-file usage | Last tracked change |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const entry of entries) {
      const usage = [
        entry.usage,
        entry.entryCommand ? `Entry: ${entry.entryCommand}` : '',
        entry.owner ? `Owner: ${entry.owner}` : '',
      ].filter(Boolean).join('<br>');
      lines.push(
        `| \`${entry.path}\` `
        + `| ${escapeMarkdown(usage)} `
        + `| ${escapeMarkdown(compactList(documentReferences.get(entry.path)))} `
        + `| ${escapeMarkdown(compactList(moduleReferences.get(entry.path)))} `
        + `| ${escapeMarkdown(compactList(inFileUsage.get(entry.path), 3))} `
        + `| ${escapeMarkdown(lastChanges.get(entry.path) ?? 'uncommitted')} |`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

function writeInventory(catalog, args) {
  const outputIndex = args.indexOf('--write');
  const outputPath = outputIndex >= 0
    ? resolve(repoRoot, args[outputIndex + 1] ?? '')
    : defaultInventoryPath;
  if (!toRepoPath(outputPath) || toRepoPath(outputPath).startsWith('../')) {
    throw new Error('Inventory output must stay inside the repository');
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buildInventory(catalog), 'utf8');
  console.log(`Wrote ${toRepoPath(outputPath)}`);
}

function printHelp() {
  console.log(`Usage:
  node scripts/scripts-catalog.mjs check
  node scripts/scripts-catalog.mjs list [<class> | --class <class>]
  node scripts/scripts-catalog.mjs inventory [--write <repo-relative-path>]

Classes: ${SCRIPT_CLASSES.join(', ')}`);
}

function main() {
  const [command = 'list', ...args] = process.argv.slice(2);
  if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }
  const catalog = loadCatalog();
  if (command === 'check') {
    assertValid(catalog);
    console.log(`Scripts catalog OK: ${catalog.entries.length} .mjs files`);
    return;
  }
  if (command === 'list') {
    listCatalog(catalog, args);
    return;
  }
  if (command === 'inventory') {
    writeInventory(catalog, args);
    return;
  }
  throw new Error(`Unknown command "${command}"`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
