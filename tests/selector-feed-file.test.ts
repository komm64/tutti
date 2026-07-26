import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateSelectorFeed } from '../src/utils/selector-feed';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const feedPath = process.env.SELECTOR_FEED_PATH
  ? resolve(process.env.SELECTOR_FEED_PATH)
  : resolve(repoRoot, 'tests', 'fixtures', 'selectors-feed-v1.json');

describe('selector feed file', () => {
  it(`matches the schema-v1 wire contract: ${feedPath}`, () => {
    const feed = JSON.parse(readFileSync(feedPath, 'utf8')) as unknown;
    const result = validateSelectorFeed(feed);
    expect(
      result.ok ? [] : result.errors,
      result.ok ? undefined : `Invalid selector feed:\n${result.errors.join('\n')}`,
    ).toEqual([]);
  });
});
