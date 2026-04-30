// 簡易 PNG エンコーダで Web Store 用プロモタイル(440×280)を生成。
// テキスト描画はできないので、ロゴ T と背景グラデーションのミニマル版。
// 後で Figma 等で文字載せして差し替えるのが理想だが、申請まずブロックしないための placeholder。
//   `node scripts/gen-promo.mjs` で出力 → docs/promo-440x280.png
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
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

function makePng(w, h, pixelFn) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;

  const rowSize = w * 4 + 1;
  const raw = Buffer.alloc(rowSize * h);
  for (let y = 0; y < h; y++) {
    raw[y * rowSize] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const idx = y * rowSize + 1 + x * 4;
      raw[idx] = r; raw[idx + 1] = g; raw[idx + 2] = b; raw[idx + 3] = a;
    }
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const W = 440, H = 280;

// teal-600 → teal-700 の対角グラデーション
const C1 = [13, 148, 136];   // #0d9488
const C2 = [15, 118, 110];   // #0f766e
const FG = [255, 255, 255, 255];

function lerp(a, b, t) { return a + (b - a) * t; }
function bgColor(x, y) {
  const t = (x / W + y / H) / 2;
  return [
    Math.round(lerp(C1[0], C2[0], t)),
    Math.round(lerp(C1[1], C2[1], t)),
    Math.round(lerp(C1[2], C2[2], t)),
    255,
  ];
}

// 中央左にロゴ T を配置(白角丸正方形 + 中の T 字シルエット)
const BADGE_SIZE = 140;
const BADGE_X = 60;
const BADGE_Y = (H - BADGE_SIZE) / 2;
const BADGE_R = 22;
const TEAL = [13, 148, 136, 255];

function inRoundedRect(x, y, x0, y0, w, h, r) {
  const x1 = x0 + w, y1 = y0 + h;
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
  // corner clip
  const corners = [[x0 + r, y0 + r], [x1 - r, y0 + r], [x0 + r, y1 - r], [x1 - r, y1 - r]];
  for (const [cx, cy] of corners) {
    if (((x < cx) === (cx === x0 + r)) && ((y < cy) === (cy === y0 + r))) {
      // この角に入っている候補
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) return false;
    }
  }
  return true;
}

function pixel(x, y) {
  // 背景
  let c = bgColor(x, y);

  // 白い角丸 badge
  if (inRoundedRect(x, y, BADGE_X, BADGE_Y, BADGE_SIZE, BADGE_SIZE, BADGE_R)) {
    c = [255, 255, 255, 255];
  }

  // T 字を badge 内に描画
  const cx = BADGE_X + BADGE_SIZE / 2;
  const top = BADGE_Y + BADGE_SIZE * 0.22;
  const bottom = BADGE_Y + BADGE_SIZE * 0.78;
  const barH = BADGE_SIZE * 0.16;
  const barLeft = BADGE_X + BADGE_SIZE * 0.22;
  const barRight = BADGE_X + BADGE_SIZE * 0.78;
  const stemW = BADGE_SIZE * 0.18;

  const inHorizontal = y >= top && y < top + barH && x >= barLeft && x < barRight;
  const inVertical = x >= cx - stemW / 2 && x < cx + stemW / 2 && y >= top && y < bottom;
  if (inHorizontal || inVertical) c = TEAL;

  // 右側に SNS を表す小さな円を散らす(装飾)
  const dots = [
    { cx: 270, cy: 90, r: 12 },
    { cx: 320, cy: 60, r: 10 },
    { cx: 360, cy: 110, r: 14 },
    { cx: 300, cy: 150, r: 11 },
    { cx: 380, cy: 180, r: 13 },
    { cx: 340, cy: 220, r: 10 },
    { cx: 280, cy: 200, r: 9 },
  ];
  for (const d of dots) {
    if (Math.hypot(x - d.cx, y - d.cy) < d.r) {
      c = [255, 255, 255, 230];
    }
  }

  return c;
}

const png = makePng(W, H, pixel);
const outPath = resolve(__dirname, '../docs/promo-440x280.png');
writeFileSync(outPath, png);
console.log(`generated ${outPath} (${png.length} bytes)`);
