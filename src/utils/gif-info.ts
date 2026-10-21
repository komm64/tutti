/**
 * GIF のフレーム数と再生時間をヘッダ / ブロック構造から読む (デコードはしない)。
 * 動画化が必要な SNS で「アニメ GIF か静止 GIF か」「ループで何秒に伸ばすか」を
 * 決めるのに使う。壊れた GIF は null。
 */
export interface GifInfo {
  width: number;
  height: number;
  frames: number;
  /** 1 ループ分の再生時間 (ms)。delay 0/1 は browser 同様 100ms 扱い */
  durationMs: number;
}

const MIN_FRAME_DELAY_MS = 20;
const DEFAULT_FRAME_DELAY_MS = 100;

export function readGifInfo(bytes: Uint8Array): GifInfo | null {
  if (bytes.length < 13) return null;
  const sig = String.fromCharCode(...bytes.subarray(0, 6));
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  const width = bytes[6]! | (bytes[7]! << 8);
  const height = bytes[8]! | (bytes[9]! << 8);
  const flags = bytes[10]!;
  let pos = 13;
  if (flags & 0x80) pos += 3 * (1 << ((flags & 0x07) + 1));

  let frames = 0;
  let durationMs = 0;
  let pendingDelayMs = 0;

  const skipSubBlocks = (): boolean => {
    while (pos < bytes.length) {
      const size = bytes[pos]!;
      pos += 1;
      if (size === 0) return true;
      pos += size;
    }
    return false;
  };

  while (pos < bytes.length) {
    const block = bytes[pos]!;
    pos += 1;
    if (block === 0x3b) break; // trailer
    if (block === 0x21) {
      const label = bytes[pos];
      pos += 1;
      if (label === 0xf9 && bytes[pos] === 4 && pos + 4 < bytes.length) {
        const delayCs = bytes[pos + 2]! | (bytes[pos + 3]! << 8);
        const delayMs = delayCs * 10;
        pendingDelayMs = delayMs < MIN_FRAME_DELAY_MS ? DEFAULT_FRAME_DELAY_MS : delayMs;
      }
      if (!skipSubBlocks()) return null;
      continue;
    }
    if (block === 0x2c) {
      if (pos + 9 > bytes.length) return null;
      const localFlags = bytes[pos + 8]!;
      pos += 9;
      if (localFlags & 0x80) pos += 3 * (1 << ((localFlags & 0x07) + 1));
      pos += 1; // LZW minimum code size
      if (!skipSubBlocks()) return null;
      frames += 1;
      durationMs += pendingDelayMs || DEFAULT_FRAME_DELAY_MS;
      pendingDelayMs = 0;
      continue;
    }
    return null;
  }
  if (frames === 0) return null;
  return { width, height, frames, durationMs };
}
