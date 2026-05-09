/**
 * @ffmpeg/core のランタイム (`ffmpeg-core.js` + `ffmpeg-core.wasm`) を
 * `public/ffmpeg/` にコピー。ビルド前に実行する (postinstall + prebuild)。
 *
 * MV3 では remote URL からの wasm 読み込みが禁止 = 拡張本体に同梱必須。
 * 公式パッケージの dist は ~30MB あるが、これが圧縮要件で唯一の現実解。
 */

import { mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'node_modules/@ffmpeg/core/dist/umd');
const dst = resolve(root, 'public/ffmpeg');

if (!existsSync(src)) {
  console.error(`[copy-ffmpeg] missing source: ${src}`);
  console.error('[copy-ffmpeg] did you `npm install` @ffmpeg/core?');
  process.exit(1);
}

mkdirSync(dst, { recursive: true });

for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  const from = resolve(src, file);
  const to = resolve(dst, file);
  copyFileSync(from, to);
  const size = (statSync(to).size / 1024 / 1024).toFixed(1);
  console.log(`[copy-ffmpeg] ${file} (${size} MB)`);
}
