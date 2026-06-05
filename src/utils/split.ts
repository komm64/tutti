/**
 * テキストを指定文字数以下のチャンクに分割する。
 * 複数チャンクになる場合は先頭に "(1/N) " 形式の連番を付ける。
 * 分割は単語境界を優先し、単語が limit を超える場合のみ途中で切る。
 *
 * **hashtag 保護**: 境界が `#word` の word 中に来た場合、'#' の直前まで
 * 巻き戻して hashtag を次チャンクに持ち越す。これしないと "#anim" + "e" の
 * ように途切れて意味が壊れる。
 */
export type TextMeasure = (text: string) => number;

export function splitText(text: string, limit: number, measure: TextMeasure = (s) => s.length): string[] {
  if (measure(text) <= limit) return [text];

  /** split 位置が hashtag の word 中なら '#' 直前まで巻き戻す */
  function avoidSplittingHashtag(s: string, pos: number): number {
    if (pos >= s.length) return pos;
    // 後方探索: pos から前に向かって [\p{L}\p{N}_] が続く間、'#' に当たれば
    // その位置 (直前の space 込みなら更に前) で切る
    let i = pos;
    while (i > 0 && /[\p{L}\p{N}_]/u.test(s[i]!)) i--;
    if (i >= 0 && s[i] === '#') {
      // hashtag 開始位置。直前の whitespace ごとに切る
      let cut = i;
      while (cut > 0 && /\s/.test(s[cut - 1]!)) cut--;
      // ただし cut が 0 = chunk まるごと hashtag だけになる場合は元の位置を返す
      // (= 巨大 hashtag 単発で chunk 全部食う) — その場合は素直に途中で切る
      if (cut > 0) return cut;
    }
    return pos;
  }

  function findFittingEnd(s: string, effectiveLimit: number): number {
    let end = 0;
    let offset = 0;
    // Keep scanning after an over-limit prefix: completing a URL can reduce its
    // X weighted length to the fixed transformed URL length.
    for (const grapheme of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) {
      offset = grapheme.index + grapheme.segment.length;
      if (measure(s.slice(0, offset)) <= effectiveLimit) end = offset;
    }
    return end;
  }

  function doSplit(effectiveLimit: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (measure(remaining) <= effectiveLimit) {
        chunks.push(remaining);
        break;
      }
      const fittingEnd = findFittingEnd(remaining, effectiveLimit);
      if (fittingEnd <= 0) {
        throw new Error(`splitText: limit ${effectiveLimit} is too small for one grapheme`);
      }
      const spaceIdx = remaining.lastIndexOf(' ', fittingEnd - 1);
      let splitAt = spaceIdx > 0 ? spaceIdx : fittingEnd;
      splitAt = avoidSplittingHashtag(remaining, splitAt);
      chunks.push(remaining.slice(0, splitAt).trimEnd());
      remaining = remaining.slice(splitAt).trimStart();
    }
    return chunks;
  }

  // 1 回目: チャンク数を概算
  const rough = doSplit(limit);
  let n = rough.length;
  let overhead = measure(`(${0 + 1}/${n}) `);

  // 2 回目: 実際のオーバーヘッドを引いて再分割
  let final = doSplit(limit - overhead);

  // チャンク数が増えた場合もう 1 パス
  if (final.length > n) {
    n = final.length;
    overhead = measure(`(${0 + 1}/${n}) `);
    final = doSplit(limit - overhead);
  }

  const total = final.length;
  return final.map((chunk, i) => `(${i + 1}/${total}) ${chunk}`);
}
