/**
 * Chrome Web Store の item の現在ステータスを取得して表示する。
 *
 * 使い方:
 *   node scripts/cws/status.mjs
 *
 * 出力例:
 *   id: mcjfgdcffjfhkcepfpnifcpknlddmbpe
 *   uploadState: SUCCESS
 *   crxVersion: 0.4.11
 *   itemError: ...
 */

import { cwsApi, loadEnv, requireEnv } from './_lib.mjs';

async function main() {
  const env = loadEnv();
  requireEnv(env, 'CWS_ITEM_ID');

  // projection=DRAFT で現在 draft の状態を取得 (uploadState と version、エラー詳細)
  const res = await cwsApi(env, `/chromewebstore/v1.1/items/${env.CWS_ITEM_ID}?projection=DRAFT`);

  console.log('=== Chrome Web Store item status ===');
  console.log(`id:           ${res.id ?? env.CWS_ITEM_ID}`);
  console.log(`uploadState:  ${res.uploadState ?? '(unknown)'}`);
  console.log(`crxVersion:   ${res.crxVersion ?? '(unknown)'}`);
  console.log(`kind:         ${res.kind ?? '(unknown)'}`);

  if (res.itemError && res.itemError.length > 0) {
    console.log('');
    console.log('itemError:');
    for (const e of res.itemError) {
      console.log(`  - ${e.error_code ?? '?'}: ${e.error_detail ?? ''}`);
    }
  }

  // raw 全体は debug 用に末尾で
  console.log('');
  console.log('--- raw response ---');
  console.log(JSON.stringify(res, null, 2));
}

main().catch((e) => {
  console.error('fatal:', e?.message ?? e);
  process.exit(1);
});
