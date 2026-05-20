// Web Store スクショの popup に添付するサンプル画像 (1024x1024) を生成。
// pollinations.ai (no-key AI image gen) で「ライブ会場のステージ + ギタリスト
// シルエット + 紫オレンジ stage light」を生成。scene の caption (今日のセッション
// いい感じ / 来週末ライブやります) どちらにも嵌るアートワーク。
//
// 出力先: docs/screenshots/attach-sample.png
// 使い方: node scripts/gen-attach-image.mjs
//
// prompt を差し替えたいときは PROMPT 変数を編集。再現性 (seed) は URL に seed=N で固定可。

import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('docs/screenshots', { recursive: true });

const PROMPT = [
  'live music concert stage',
  'with vibrant purple and orange stage lights',
  'musician silhouette with guitar',
  'cinematic atmospheric haze',
  'dramatic spotlight',
  'photographic style',
].join(', ');

const url = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(PROMPT)}`);
url.searchParams.set('width', '1024');
url.searchParams.set('height', '1024');
url.searchParams.set('nologo', 'true');
url.searchParams.set('model', 'flux');

console.log('[gen-attach-image] fetching', url.toString());

const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
if (!res.ok) throw new Error(`pollinations.ai ${res.status}: ${await res.text().catch(() => '')}`);

const buf = Buffer.from(await res.arrayBuffer());
if (buf.length < 5000) throw new Error(`response too small (${buf.length} bytes), likely error stub`);

const out = 'docs/screenshots/attach-sample.png';
writeFileSync(out, buf);
console.log(`[gen-attach-image] wrote ${out} (${buf.length} bytes)`);
