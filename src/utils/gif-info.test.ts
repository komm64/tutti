import { describe, expect, it } from 'vitest';
import { readGifInfo } from './gif-info';

/** 1x1 フレームを delays (centiseconds) 分並べた最小 GIF を組み立てる */
function buildGif(delaysCs: (number | null)[], width = 4, height = 2): Uint8Array {
  const bytes: number[] = [
    ...'GIF89a'.split('').map((c) => c.charCodeAt(0)),
    width & 0xff, width >> 8, height & 0xff, height >> 8,
    0x80, 0, 0, // global color table (2 colors)
    0, 0, 0, 255, 255, 255,
    // NETSCAPE loop extension
    0x21, 0xff, 11, ...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0,
  ];
  for (const delay of delaysCs) {
    if (delay !== null) bytes.push(0x21, 0xf9, 4, 0, delay & 0xff, delay >> 8, 0, 0);
    bytes.push(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x4c, 0x01, 0);
  }
  bytes.push(0x3b);
  return new Uint8Array(bytes);
}

describe('readGifInfo', () => {
  it('counts frames and sums frame delays', () => {
    expect(readGifInfo(buildGif([10, 20, 30]))).toEqual({
      width: 4, height: 2, frames: 3, durationMs: 600,
    });
  });

  it('treats zero / missing delays as 100ms like browsers do', () => {
    expect(readGifInfo(buildGif([0, null]))?.durationMs).toBe(200);
  });

  it('reports a single-frame GIF', () => {
    expect(readGifInfo(buildGif([null]))?.frames).toBe(1);
  });

  it('rejects non-GIF and truncated data', () => {
    expect(readGifInfo(new TextEncoder().encode('not a gif at all'))).toBeNull();
    expect(readGifInfo(buildGif([10]).subarray(0, 40))).toBeNull();
  });
});
