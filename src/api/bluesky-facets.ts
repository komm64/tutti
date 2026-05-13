/**
 * Bluesky の rich text facets を text から生成する。
 *
 * Bluesky の post record は `text` だけだと **plain text** 扱い。`#hashtag` /
 * `@handle.bsky.social` / `https://...` を clickable にするには `facets` 配列
 * で「この byte range はこの種類のエンティティ」と明示する必要がある。
 *
 * ATProto の facet 形式: https://atproto.com/specs/lexicon#richtext-facet
 *   {
 *     index: { byteStart: N, byteEnd: M },   // UTF-8 byte offset
 *     features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'name' }],
 *   }
 *
 * byte offset は **UTF-8 のバイト位置** (= char index じゃない)。日本語含む
 * テキストでは TextEncoder で計算する。
 */

type Facet = {
  index: { byteStart: number; byteEnd: number };
  features: Array<
    | { $type: 'app.bsky.richtext.facet#tag'; tag: string }
    | { $type: 'app.bsky.richtext.facet#link'; uri: string }
    | { $type: 'app.bsky.richtext.facet#mention'; did: string }
  >;
};

/**
 * 1 char index を UTF-8 byte index に変換するためのプリ計算済 array を作る。
 * O(n) で前計算しておけば各 facet の byteStart/byteEnd は O(1) で引ける。
 */
function makeCharToByteMap(text: string): number[] {
  const enc = new TextEncoder();
  const map = new Array<number>(text.length + 1);
  let byte = 0;
  for (let i = 0; i < text.length; i++) {
    map[i] = byte;
    // surrogate pair は 2 char で 1 codepoint → encode 1 回で済ませる
    const ch = text[i]!;
    const code = ch.charCodeAt(0);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      // high surrogate、次の low と組で encode
      byte += enc.encode(ch + text[i + 1]!).length;
      map[i + 1] = byte; // low の位置は high と同じ byte 開始
      i += 1;
      // continue ループ
    } else {
      byte += enc.encode(ch).length;
    }
  }
  map[text.length] = byte;
  return map;
}

/**
 * text から `#hashtag` / `https://...` 等の facet を全部抽出する。
 *
 * - hashtag: `#word` (word は alphanumeric + underscore、日本語含む `\p{L}\p{N}_`)
 * - link: bare URL (`https://...` / `http://...`)
 * - mention: `@handle.domain` (Bluesky handle 形式)
 */
export function buildBlueskyFacets(text: string): Facet[] {
  const facets: Facet[] = [];
  const charToByte = makeCharToByteMap(text);

  // hashtag: 直前が空白 / 行頭 / 句読点 のとき #word を facet 化。
  // 数字だけ ("#123") は Bluesky 側で reject される傾向があるので、英字含むやつのみ
  // (ただし日本語 #日本語タグ は OK にする)
  const HASHTAG = /(?:^|[\s\p{P}])#([\p{L}_][\p{L}\p{N}_]{0,63})/gu;
  for (const m of text.matchAll(HASHTAG)) {
    const tag = m[1]!;
    // m.index は match の開始位置 (前置 char 含む)
    const prefixOffset = m[0]!.startsWith('#') ? 0 : 1;
    const hashStartChar = (m.index ?? 0) + prefixOffset; // '#' の位置
    const tagStartChar = hashStartChar + 1;
    const tagEndChar = tagStartChar + tag.length;
    facets.push({
      // facet の byte range は '#' を含むのが ATProto の慣例 (公式 bsky-app と互換)
      index: { byteStart: charToByte[hashStartChar]!, byteEnd: charToByte[tagEndChar]! },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag }],
    });
  }

  // bare URL: trailing 句読点は含めない
  const URL_RE = /https?:\/\/[^\s]+/g;
  for (const m of text.matchAll(URL_RE)) {
    let uri = m[0]!;
    // trailing 句読点・括弧を削る
    while (/[).,;:!?」』】]$/.test(uri)) uri = uri.slice(0, -1);
    const startChar = m.index ?? 0;
    const endChar = startChar + uri.length;
    facets.push({
      index: { byteStart: charToByte[startChar]!, byteEnd: charToByte[endChar]! },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri }],
    });
  }

  // mention の facet 化は handle→did の resolve が必要 (com.atproto.identity.resolveHandle)。
  // Tutti のクロスポスト用途では mention はまれなので Phase 2 として保留。
  // 必要になったら別関数で API call して did を取得 → features に追加。

  return facets;
}
