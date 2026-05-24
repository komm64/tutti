/**
 * 投稿本文 + 添付メディアの content hash (SHA-256 hex)。
 *
 * 用途 (v0.5.5〜):
 * - 同一内容の重複投稿検出 (今は内部メトリクスのみ、 将来 popup でも警告可)
 * - 履歴 entry の安定識別子 (timestamp + 偶発衝突を回避)
 *
 * payload は `text + '\n--media\n' + 各 media digest を sort して join`。
 * media digest 自体は media-digest.ts で計算 (Blob / ArrayBuffer / base64 等から)。
 *
 * SHA-256 は WebCrypto subtle. crypto API は MV3 extension page / SW 両方で使える。
 */

const SEPARATOR = '\n--media\n';

export async function computeBodyHash(
  text: string,
  mediaDigests: readonly string[] = [],
): Promise<string> {
  const sorted = [...mediaDigests].sort();
  const payload = text + (sorted.length ? SEPARATOR + sorted.join('\n') : '');
  return sha256Hex(payload);
}

export async function sha256Hex(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  let data: ArrayBuffer;
  if (typeof input === 'string') {
    data = new TextEncoder().encode(input).buffer as ArrayBuffer;
  } else if (input instanceof Uint8Array) {
    data = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
  } else {
    data = input;
  }
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
