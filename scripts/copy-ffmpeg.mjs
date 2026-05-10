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
// **multi-thread (core-mt) ESM build を使う**。
// - core-mt: SharedArrayBuffer + pthread worker で libx264 を並列化、2-4x 高速
// - ESM build: @ffmpeg/ffmpeg 0.12+ の Worker は type: "module" なので
//   await import(coreURL) で取得可能な ESM 形式が必須 (UMD は default export なし)
// - MV3 offscreen は crossOriginIsolated 既定 true なので SAB 利用可
const src = resolve(root, 'node_modules/@ffmpeg/core-mt/dist/esm');
const dst = resolve(root, 'public/ffmpeg');

if (!existsSync(src)) {
  console.error(`[copy-ffmpeg] missing source: ${src}`);
  console.error('[copy-ffmpeg] did you `npm install` @ffmpeg/core?');
  process.exit(1);
}

mkdirSync(dst, { recursive: true });

// core-mt は 3 ファイル: js (loader) + wasm (本体) + worker.js (pthread worker)
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js']) {
  const from = resolve(src, file);
  const to = resolve(dst, file);
  copyFileSync(from, to);
  const size = (statSync(to).size / 1024 / 1024).toFixed(1);
  console.log(`[copy-ffmpeg] ${file} (${size} MB)`);
}
