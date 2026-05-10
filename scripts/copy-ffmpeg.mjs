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
// **single-thread @ffmpeg/core ESM build を使う**。
// 旧 v0.4.44 で core-mt (multi-thread) を試したが「圧縮ツール読み込み中」で
// hang する報告。MV3 offscreen が SharedArrayBuffer を許可するには COOP/COEP
// ヘッダで cross-origin-isolated にする必要があり、これは extension 内の
// 静的ファイルでは declarativeNetRequest 等で別途仕込む必要があって複雑。
// 安定動作を優先して single-thread に戻す。性能差は ultrafast + 720p downscale
// で多くカバー済 (vs 旧 default の 6-12x 高速)
const src = resolve(root, 'node_modules/@ffmpeg/core/dist/esm');
const dst = resolve(root, 'public/ffmpeg');

if (!existsSync(src)) {
  console.error(`[copy-ffmpeg] missing source: ${src}`);
  console.error('[copy-ffmpeg] did you `npm install` @ffmpeg/core?');
  process.exit(1);
}

mkdirSync(dst, { recursive: true });

// single-thread は 2 ファイル: loader js + wasm
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  const from = resolve(src, file);
  const to = resolve(dst, file);
  copyFileSync(from, to);
  const size = (statSync(to).size / 1024 / 1024).toFixed(1);
  console.log(`[copy-ffmpeg] ${file} (${size} MB)`);
}
