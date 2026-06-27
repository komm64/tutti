/**
 * 本文から `#hashtag` を抽出するユーティリティ。
 * Pixiv / DeviantArt / YouTube / Tumblr など、 SNS 別に上限や fallback default が
 * 異なるので options で受ける。 元 `extractPixivTags` を一般化したもの (v0.4.72〜)。
 */

export interface ExtractHashtagsOptions {
  /** 最大個数 (overflow は捨てる) */
  maxCount: number;
  /** 各 tag の最大 char 数 (越えると slice) */
  maxLen: number;
  /**
   * 0 個だったときの fallback default。 SNS が tags 必須の場合に何かを入れたい用
   * (Pixiv の `['Tutti']` 等)。 空配列なら fallback 無し。
   */
  defaultIfEmpty?: string[];
}

/**
 * 本文から `#word` を抽出して配列で返す。
 * - Unicode 文字 (`\p{L}\p{N}_`) を許容 (日本語 / 中国語 / 数字 / アンダースコア)
 * - 同名 tag は case-insensitive で dedupe
 * - 先頭 `#` は剥がす
 */
export function extractHashtags(text: string, opts: ExtractHashtagsOptions): string[] {
  const matches = text.match(/(?:^|\s|\b)#([\p{L}\p{N}_]{1,200})/gu) ?? [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    const clean = m.replace(/^[\s]*#/, '').slice(0, opts.maxLen);
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    tags.push(clean);
    if (tags.length >= opts.maxCount) break;
  }
  return tags.length > 0 ? tags : (opts.defaultIfEmpty ?? []);
}

/**
 * 本文から `#hashtag` を取り除く。 別 tag field に移した後の caption から
 * 重複を消す用 (Pixiv / DA / YouTube の description は inline `#word` を
 * hashtag link 化しないので残すと見栄えが悪い)。
 * Tumblr は通常 inline でも hashtag 化されるが、 compose remount 後の本文検証では
 * tag field へ移動済みの状態を照合するために使う。
 */
export function stripHashtagsFromText(text: string): string {
  return text
    .replace(/(?:^|\s)#[\p{L}\p{N}_]{1,200}/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
