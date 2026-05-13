import { describe, it, expect } from 'vitest';
import { buildBlueskyFacets } from './bluesky-facets';

describe('buildBlueskyFacets', () => {
  it('plain text に facet は無い', () => {
    expect(buildBlueskyFacets('hello world')).toEqual([]);
  });

  it('単一 hashtag を facet 化する', () => {
    const text = 'check out #anime today';
    const facets = buildBlueskyFacets(text);
    expect(facets).toHaveLength(1);
    expect(facets[0]!.features[0]).toEqual({ $type: 'app.bsky.richtext.facet#tag', tag: 'anime' });
    // byte range は '#anime' 全体を含む
    const fromIdx = text.indexOf('#anime');
    expect(facets[0]!.index.byteStart).toBe(fromIdx);
    expect(facets[0]!.index.byteEnd).toBe(fromIdx + '#anime'.length);
  });

  it('複数 hashtag を全部拾う', () => {
    const facets = buildBlueskyFacets('A #foo and #bar then #baz');
    expect(facets).toHaveLength(3);
    expect(facets.map((f) => (f.features[0] as { tag: string }).tag)).toEqual(['foo', 'bar', 'baz']);
  });

  it('文頭 hashtag も拾う', () => {
    const facets = buildBlueskyFacets('#start of post');
    expect(facets).toHaveLength(1);
    expect((facets[0]!.features[0] as { tag: string }).tag).toBe('start');
  });

  it('数字始まり hashtag (#123) は除外', () => {
    expect(buildBlueskyFacets('hello #123 there')).toEqual([]);
  });

  it('日本語 hashtag を拾う', () => {
    const text = 'こんにちは #日本語タグ ですよ';
    const facets = buildBlueskyFacets(text);
    expect(facets).toHaveLength(1);
    expect((facets[0]!.features[0] as { tag: string }).tag).toBe('日本語タグ');
    // 日本語 1 char = 3 byte なので byte index と char index は違う
    const charIdx = text.indexOf('#日本語タグ');
    const enc = new TextEncoder();
    const byteIdx = enc.encode(text.slice(0, charIdx)).length;
    expect(facets[0]!.index.byteStart).toBe(byteIdx);
  });

  it('URL を facet 化する', () => {
    const text = 'see https://example.com/post here';
    const facets = buildBlueskyFacets(text);
    expect(facets).toHaveLength(1);
    expect(facets[0]!.features[0]).toEqual({
      $type: 'app.bsky.richtext.facet#link',
      uri: 'https://example.com/post',
    });
  });

  it('URL 末尾の句読点は uri から除く', () => {
    const facets = buildBlueskyFacets('go to https://example.com.');
    expect((facets[0]!.features[0] as { uri: string }).uri).toBe('https://example.com');
  });

  it('hashtag + URL 混在', () => {
    const facets = buildBlueskyFacets('#cats https://cat.com #cute');
    expect(facets).toHaveLength(3);
  });

  it('email っぽいやつは hashtag 化しない', () => {
    expect(buildBlueskyFacets('mail me at user@example.com')).toEqual([]);
  });
});
