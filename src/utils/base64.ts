/**
 * 画像/動画 binary を popup → background → content script で運ぶ用の base64 変換。
 *
 * Why: chrome.runtime.sendMessage / tabs.sendMessage の wire format は
 * 現行 Chrome では ArrayBuffer を `{}` に潰す(JSON シリアライズ相当)。
 * structured clone を期待していると Mastodon が 422 を返すなどの実害が出るので、
 * 拡張内通信は base64 文字列で統一する(ImageAttachment.data: string)。
 */

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  // 大きい画像で String.fromCharCode(...bytes) はスタック溢れするのでチャンク化
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** base64 の見かけ長から元の byte 数を計算する(`==` パディング考慮) */
export function base64ByteLength(b64: string): number {
  if (b64.length === 0) return 0;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return (b64.length * 3) / 4 - padding;
}
