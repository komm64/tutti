// Generate a 100x100 RGBA PNG (red square) without external libraries.
import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

const W = 100, H = 100;

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  // CRC32
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0; }
  let c = 0xffffffff;
  for (const b of body) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  const crc = Buffer.alloc(4); crc.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const rowSize = W * 4 + 1;
const raw = Buffer.alloc(rowSize * H);
for (let y = 0; y < H; y++) {
  raw[y * rowSize] = 0;
  for (let x = 0; x < W; x++) {
    const i = y * rowSize + 1 + x * 4;
    raw[i] = 255;     // R
    raw[i + 1] = 80;  // G
    raw[i + 2] = 80;  // B
    raw[i + 3] = 255; // A
  }
}
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
const path = 'C:\\Users\\komm64\\AppData\\Local\\Temp\\tutti-test-100x100.png';
writeFileSync(path, png);
console.log(`generated ${path} (${png.length} bytes)`);
