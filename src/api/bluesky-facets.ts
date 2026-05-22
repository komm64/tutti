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

  return facets;
}

/** `@handle.domain` を検出する regex (Bluesky handle 形式)。 capture group は handle 本体 (先頭 `@` 抜き)。 */
const MENTION_RE = /(?:^|[\s\p{P}])@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)/gu;

/** handle → did を resolve (com.atproto.identity.resolveHandle)。 失敗時 null。 */
async function resolveHandle(handle: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { did?: string };
    return data.did ?? null;
  } catch {
    return null;
  }
}

/**
 * `buildBlueskyFacets` に `@mention` facet を加えた async 版 (v0.4.78〜)。
 * 各 mention の handle を resolveHandle で did に変換し、 失敗した mention は
 * facet を立てない (post 自体は plain text として通る、 link 化しないだけ)。
 * 同じ handle は cache して resolve 1 回。
 */
export async function buildBlueskyFacetsAsync(text: string): Promise<Facet[]> {
  const facets = buildBlueskyFacets(text);
  const charToByte = makeCharToByteMap(text);

  const matches = Array.from(text.matchAll(MENTION_RE));
  if (matches.length === 0) return facets;
  const uniqueHandles = Array.from(new Set(matches.map((m) => m[1]!)));
  const dids = await Promise.all(uniqueHandles.map(resolveHandle));
  const cache = new Map<string, string | null>();
  uniqueHandles.forEach((h, i) => cache.set(h, dids[i] ?? null));

  for (const m of matches) {
    const handle = m[1]!;
    const did = cache.get(handle);
    if (!did) continue;
    const prefixOffset = m[0]!.startsWith('@') ? 0 : 1;
    const atStartChar = (m.index ?? 0) + prefixOffset;
    const handleEndChar = atStartChar + 1 + handle.length;
    facets.push({
      index: { byteStart: charToByte[atStartChar]!, byteEnd: charToByte[handleEndChar]! },
      features: [{ $type: 'app.bsky.richtext.facet#mention', did }],
    });
  }
  return facets;
}
