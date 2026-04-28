/**
 * テキストを指定文字数以下のチャンクに分割する。
 * 複数チャンクになる場合は先頭に "(1/N) " 形式の連番を付ける。
 * 分割は単語境界を優先し、単語が limit を超える場合のみ途中で切る。
 */
export function splitText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];

  function prefixLen(i: number, total: number): number {
    return `(${i + 1}/${total}) `.length;
  }

  function doSplit(effectiveLimit: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= effectiveLimit) {
        chunks.push(remaining);
        break;
      }
      const spaceIdx = remaining.lastIndexOf(' ', effectiveLimit - 1);
      const splitAt = spaceIdx > 0 ? spaceIdx : effectiveLimit;
      chunks.push(remaining.slice(0, splitAt).trimEnd());
      remaining = remaining.slice(splitAt).trimStart();
    }
    return chunks;
  }

  // 1 回目: チャンク数を概算
  const rough = doSplit(limit);
  let n = rough.length;
  let overhead = prefixLen(0, n);

  // 2 回目: 実際のオーバーヘッドを引いて再分割
  let final = doSplit(limit - overhead);

  // チャンク数が増えた場合もう 1 パス
  if (final.length > n) {
    n = final.length;
    overhead = prefixLen(0, n);
    final = doSplit(limit - overhead);
  }

  const total = final.length;
  return final.map((chunk, i) => `(${i + 1}/${total}) ${chunk}`);
}
