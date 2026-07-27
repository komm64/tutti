import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adapters } from './registry';
import type { ContentKind, PlatformAdapter } from './types';

const PLATFORM_MATRIX = readFileSync(
  new URL('../../docs/platform-matrix.md', import.meta.url),
  'utf8',
);

const REGISTERED_ADAPTERS = Object.values(adapters)
  .filter((adapter): adapter is PlatformAdapter => adapter !== undefined);

const KIND_COLUMNS: Array<[ContentKind, number]> = [
  ['text', 1],
  ['image', 2],
  ['shortVideo', 3],
  ['longVideo', 4],
];

function parseTable(heading: string): string[][] {
  const headingStart = PLATFORM_MATRIX.indexOf(`## ${heading}`);
  if (headingStart < 0) throw new Error(`Missing platform matrix section: ${heading}`);

  const section = PLATFORM_MATRIX.slice(headingStart).split(/\n## /, 1)[0] ?? '';
  return section
    .split(/\r?\n/)
    .filter((line) => /^\|.+\|$/.test(line))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()))
    .filter((cells) => cells[0] !== 'network' && !/^[-:]+$/.test(cells[0] ?? ''));
}

function adapterForDocName(docName: string): PlatformAdapter {
  const adapterName = docName.replace(/\s+\([^)]*\)$/, '');
  const matches = REGISTERED_ADAPTERS.filter((adapter) => adapter.name === adapterName);
  if (matches.length !== 1) {
    throw new Error(`Expected one adapter for docs row "${docName}", found ${matches.length}`);
  }
  return matches[0] as PlatformAdapter;
}

function expectCompletePlatformRows(rows: string[][]): void {
  const docIds = rows.map((row) => adapterForDocName(getCell(row, 0)).id).sort();
  const adapterIds = REGISTERED_ADAPTERS.map((adapter) => adapter.id).sort();
  expect(docIds).toEqual(adapterIds);
}

function getCell(row: string[], index: number): string {
  const cell = row[index];
  if (cell === undefined) throw new Error(`Missing column ${index} in docs row: ${row.join(' | ')}`);
  return cell;
}

function parseInteger(cell: string): number {
  const match = cell.match(/^([\d,]+)/);
  if (!match) throw new Error(`Expected integer value, got "${cell}"`);
  return Number((match[1] as string).replaceAll(',', ''));
}

function parseBytes(cell: string): number {
  const match = cell.match(/^([\d,]+)\s+(bytes|MiB|GiB)$/);
  if (!match) throw new Error(`Expected exact byte value, got "${cell}"`);

  const value = Number((match[1] as string).replaceAll(',', ''));
  const unit = match[2];
  if (unit === 'MiB') return value * 1024 * 1024;
  if (unit === 'GiB') return value * 1024 * 1024 * 1024;
  return value;
}

function parseDuration(cell: string): number {
  return cell === 'unlimited' ? 0 : parseInteger(cell);
}

describe('docs platform matrix', () => {
  it('reflects adapter content-kind support for every registered platform', () => {
    const rows = parseTable('Overall matrix');
    expectCompletePlatformRows(rows);

    for (const row of rows) {
      const adapter = adapterForDocName(getCell(row, 0));
      const documentedKinds = KIND_COLUMNS
        .filter(([, column]) => getCell(row, column) !== '—')
        .map(([kind]) => kind);
      expect(documentedKinds, adapter.id).toEqual(adapter.kinds);
    }
  });

  it('reflects adapter posting constraints for every registered platform', () => {
    const rows = parseTable('Posting constraints');
    expectCompletePlatformRows(rows);

    for (const row of rows) {
      const adapter = adapterForDocName(getCell(row, 0));
      const charLimit = getCell(row, 1);
      const maxImages = getCell(row, 2);
      const maxBytesPerImage = getCell(row, 3);
      const maxVideoBytes = getCell(row, 4);
      const maxDuration = getCell(row, 5);

      expect(parseInteger(charLimit), `${adapter.id} charLimit`).toBe(adapter.charLimit);

      if (adapter.kinds.includes('image')) {
        expect(parseInteger(maxImages), `${adapter.id} maxImages`).toBe(adapter.imageConstraints.maxImages);
        expect(parseBytes(maxBytesPerImage), `${adapter.id} maxBytesPerImage`)
          .toBe(adapter.imageConstraints.maxBytesPerImage);
      } else {
        expect(maxImages, `${adapter.id} maxImages`).toBe('—');
        expect(maxBytesPerImage, `${adapter.id} maxBytesPerImage`).toBe('—');
      }

      if (adapter.videoConstraints) {
        expect(parseBytes(maxVideoBytes), `${adapter.id} video maxBytes`)
          .toBe(adapter.videoConstraints.maxBytes);
        expect(parseDuration(maxDuration), `${adapter.id} video maxDurationS`)
          .toBe(adapter.videoConstraints.maxDurationS);
      } else {
        expect(maxVideoBytes, `${adapter.id} video maxBytes`).toBe('—');
        expect(maxDuration, `${adapter.id} video maxDurationS`).toBe('—');
      }
    }
  });
});
