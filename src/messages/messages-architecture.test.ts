import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const CATEGORY_MODULES = [
  'diagnostics',
  'media',
  'posting',
  'update',
  'user-session',
] as const;

describe('message contract architecture', () => {
  it('keeps src/messages.ts as a compatibility-only facade', () => {
    const facade = readFileSync('src/messages.ts', 'utf8');

    expect(facade).not.toMatch(/\bexport\s+(?:interface|const|class|enum)\b/);
    for (const category of CATEGORY_MODULES) {
      expect(facade).toContain(`export * from './messages/${category}';`);
    }
    expect(facade).toContain('export type Message =');
    expect(facade).toContain('| PostingMessage');
    expect(facade).toContain('| MediaMessage');
    expect(facade).toContain('| DiagnosticsMessage');
    expect(facade).toContain('| UpdateMessage');
    expect(facade).toContain('| UserSessionMessage');
  });

  it('owns every runtime message discriminant in exactly one category', () => {
    const owners = new Map<string, string[]>();
    for (const category of CATEGORY_MODULES) {
      const source = readFileSync(`src/messages/${category}.ts`, 'utf8');
      for (const match of source.matchAll(/\btype:\s*'([A-Z][A-Z0-9_]+)'/g)) {
        const type = match[1]!;
        owners.set(type, [...(owners.get(type) ?? []), category]);
      }
    }

    const duplicates = [...owners.entries()]
      .filter(([, categories]) => categories.length !== 1)
      .map(([type, categories]) => `${type}: ${categories.join(',')}`);
    expect(duplicates).toEqual([]);

    const decoder = readFileSync('src/utils/message-decoder.ts', 'utf8');
    const validatorBlock = decoder
      .slice(
        decoder.indexOf('const MESSAGE_VALIDATORS = {'),
        decoder.indexOf('} satisfies Record<Message[\'type\'], Validator>;'),
      );
    const decodedTypes = [...validatorBlock.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)]
      .map((match) => match[1]!)
      .sort();
    expect([...owners.keys()].sort()).toEqual(decodedTypes);
  });
});
