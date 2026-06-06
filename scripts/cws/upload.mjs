/**
 * Chrome Web Store に新 zip をアップロード (= draft 更新)。
 *
 * 使い方:
 *   node scripts/cws/upload.mjs                  # .output/tutti-{version}-chrome.zip を自動検出
 *   node scripts/cws/upload.mjs path/to/file.zip # 明示指定
 *
 * Tutti の package.json の version と同じ zip を探して上げる。
 * 新規 draft が作られて、status.mjs で lastAsyncUploadState=SUCCEEDED が見えるはず。
 *
 * その後 submit.mjs で「Submit for review」を打つ。
 *
 * 失敗パターン:
 * - "Item with id X is in publishing state" → publishing 中。Dashboard で状態確認
 * - "Item must have valid manifest" → zip 中身が壊れてる、再 build
 * - 401 / 403 → refresh token 期限切れ、再 auth
 */

import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cwsV2UploadApi, getPublisherId, loadEnv, requireEnv } from './_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

function findDefaultZip() {
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
  const candidate = resolve(repoRoot, '.output', `tutti-${pkg.version}-chrome.zip`);
  if (!existsSync(candidate)) {
    throw new Error(`zip が見つかりません: ${candidate}\n  先に \`npm run zip\` してください`);
  }
  return candidate;
}

async function main() {
  const env = loadEnv();
  requireEnv(env, 'CWS_ITEM_ID');
  const publisherId = getPublisherId(env);

  const zipPath = process.argv[2] ? resolve(process.argv[2]) : findDefaultZip();
  const size = statSync(zipPath).size;
  const sizeMB = (size / 1024 / 1024).toFixed(2);
  console.log(`[upload] zip: ${zipPath}`);
  console.log(`[upload] size: ${sizeMB} MB`);

  const bytes = readFileSync(zipPath);

  console.log('[upload] CWS にアップロード中...');
  const data = await cwsV2UploadApi(
    env,
    `/publishers/${publisherId}/items/${env.CWS_ITEM_ID}:upload`,
    bytes,
  );

  console.log('[upload] === レスポンス ===');
  console.log(JSON.stringify(data, null, 2));

  if (data.uploadState === 'SUCCEEDED') {
    console.log('');
    console.log('[upload] ✓ アップロード成功。次は `node scripts/cws/submit.mjs` で審査リクエスト');
  } else if (data.uploadState === 'IN_PROGRESS') {
    console.log('');
    console.log('[upload] ⏳ 処理中。`node scripts/cws/status.mjs` で完了確認してから submit');
  } else if (data.uploadState === 'FAILED') {
    console.error('[upload] ✗ アップロード失敗 (詳細は itemError を参照)');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('fatal:', e?.message ?? e);
  process.exit(1);
});
