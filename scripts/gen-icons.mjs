// 簡易 PNG エンコーダで Tutti の T アイコンを生成する。
// 依存ゼロ(Node.js の zlib のみ)。`node scripts/gen-icons.mjs` で実行。
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePng(size, pixelFn) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // 残りは 0(compression / filter / interlace)

  const rowSize = size * 4 + 1;
  const raw = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size);
      const idx = y * rowSize + 1 + x * 4;
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// teal-600 (#0d9488) 背景に白の T。角丸四角。
const BG = [13, 148, 136, 255];
const FG = [255, 255, 255, 255];
const TRANSPARENT = [0, 0, 0, 0];

function tIcon(x, y, size) {
  // 角丸マスク
  const r = size * 0.18;
  const cornerDist = (cx, cy) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  if (x < r && y < r && cornerDist(r, r) > r) return TRANSPARENT;
  if (x >= size - r && y < r && cornerDist(size - r, r) > r) return TRANSPARENT;
  if (x < r && y >= size - r && cornerDist(r, size - r) > r) return TRANSPARENT;
  if (x >= size - r && y >= size - r && cornerDist(size - r, size - r) > r) return TRANSPARENT;

  // T の形状(横棒 + 縦棒)
  const margin = size * 0.22;
  const barTop = margin;
  const barH = size * 0.16;
  const stemW = size * 0.18;
  const cx = size / 2;

  const inHorizontal = y >= barTop && y < barTop + barH && x >= margin && x < size - margin;
  const inVertical = x >= cx - stemW / 2 && x < cx + stemW / 2 && y >= barTop && y < size - margin;

  if (inHorizontal || inVertical) return FG;
  return BG;
}

const sizes = [16, 32, 48, 96, 128];
const outDir = resolve(__dirname, '../public/icon');
mkdirSync(outDir, { recursive: true });

for (const s of sizes) {
  const png = makePng(s, (x, y) => tIcon(x, y, s));
  const path = resolve(outDir, `${s}.png`);
  writeFileSync(path, png);
  console.log(`generated ${path} (${png.length} bytes)`);
}
