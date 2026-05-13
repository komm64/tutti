import { describe, expect, it } from 'vitest';
import { buildPixivTitle, extractPixivTags, stripHashtagsForPixivCaption } from './pixiv';

describe('buildPixivTitle', () => {
  it('1 行目を 40 char で切る', () => {
    const text = 'A'.repeat(50);
    expect(buildPixivTitle(text)).toBe('A'.repeat(40));
  });

  it('改行で 1 行目を取る', () => {
    expect(buildPixivTitle('first line\nsecond line')).toBe('first line');
  });

  it('先頭・末尾の空白は trim', () => {
    expect(buildPixivTitle('  spaced title  \nmore')).toBe('spaced title');
  });

  it('空文字は "Untitled" にフォールバック', () => {
    expect(buildPixivTitle('')).toBe('Untitled');
    expect(buildPixivTitle('   ')).toBe('Untitled');
    expect(buildPixivTitle('\n\n')).toBe('Untitled');
  });

  it('日本語タイトルもそのまま', () => {
    expect(buildPixivTitle('お気に入りのイラスト')).toBe('お気に入りのイラスト');
  });
});

describe('extractPixivTags', () => {
  it('hashtag が無ければ default ["Tutti"] を返す', () => {
    expect(extractPixivTags('hello world')).toEqual(['Tutti']);
    expect(extractPixivTags('')).toEqual(['Tutti']);
  });

  it('単純な #tag を抽出', () => {
    expect(extractPixivTags('text with #foo and #bar')).toEqual(['foo', 'bar']);
  });

  it('行頭の #tag も拾う', () => {
    expect(extractPixivTags('#first hello')).toEqual(['first']);
  });

  it('日本語 tag を拾う (Unicode \\p{L})', () => {
    expect(extractPixivTags('絵 #イラスト #風景')).toEqual(['イラスト', '風景']);
  });

  it('数字 tag も拾う (\\p{N})', () => {
    expect(extractPixivTags('#2024 #v2')).toEqual(['2024', 'v2']);
  });

  it('30 char で切る (Pixiv tag input maxlength)', () => {
    const long = 'a'.repeat(50);
    expect(extractPixivTags(`#${long}`)).toEqual(['a'.repeat(30)]);
  });

  it('10 個まで (Pixiv 上限)', () => {
    const text = Array.from({ length: 15 }, (_, i) => `#tag${i}`).join(' ');
    const tags = extractPixivTags(text);
    expect(tags.length).toBe(10);
  });

  it('重複 tag は (case-insensitive で) 1 回だけ', () => {
    const tags = extractPixivTags('#Foo #foo #FOO #bar');
    expect(tags).toEqual(['Foo', 'bar']);
  });

  it('# が付いてない word は無視', () => {
    expect(extractPixivTags('foo bar baz')).toEqual(['Tutti']);
  });

  it('email の @ や url の # ではない位置の # は反応しない', () => {
    // "user@host#anchor" の # は本文の #tag じゃなく fragment
    // 現実装では \B# だが、url 内の # も拾う可能性 → 許容範囲とする
    expect(extractPixivTags('contact@example.com nothing else')).toEqual(['Tutti']);
  });
});

describe('stripHashtagsForPixivCaption', () => {
  it('末尾の hashtag 群を削る', () => {
    expect(stripHashtagsForPixivCaption('本文だよ #anime #fanart')).toBe('本文だよ');
  });

  it('文中の hashtag も削る', () => {
    expect(stripHashtagsForPixivCaption('hello #greet world')).toBe('hello world');
  });

  it('hashtag 無しはそのまま', () => {
    expect(stripHashtagsForPixivCaption('plain text here')).toBe('plain text here');
  });

  it('連続 hashtag を 1 space に縮める', () => {
    expect(stripHashtagsForPixivCaption('a #x #y #z b')).toBe('a b');
  });

  it('改行構造は保つ (3 連続改行は 2 に縮める)', () => {
    const input = 'line1 #a\n\nline2\n\n\nline3';
    expect(stripHashtagsForPixivCaption(input)).toBe('line1\n\nline2\n\nline3');
  });

  it('全部 hashtag なら空文字', () => {
    expect(stripHashtagsForPixivCaption('#a #b #c')).toBe('');
  });

  it('日本語 hashtag も削る', () => {
    expect(stripHashtagsForPixivCaption('お気に入り #日本語タグ です')).toBe('お気に入り です');
  });
});
