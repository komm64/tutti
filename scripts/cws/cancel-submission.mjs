#!/usr/bin/env node
/**
 * Chrome Web Store の現在の pending review / active submission を取り下げる。
 *
 * 使い方:
 *   node scripts/cws/cancel-submission.mjs
 *
 * CWS 公式の v2 publishers.items.cancelSubmission API を使う。
 * 取り下げ後は draft に戻るので、upload.mjs → submit.mjs で差し替え版を出す。
 */

import { cwsV2Api, getPublisherId, loadEnv, requireEnv } from './_lib.mjs';

async function main() {
  const env = loadEnv();
  requireEnv(env, 'CWS_ITEM_ID');
  const publisherId = getPublisherId(env);

  console.log(`[cancel] item ${env.CWS_ITEM_ID} の active submission を取り下げ中...`);
  const data = await cwsV2Api(
    env,
    `/publishers/${publisherId}/items/${env.CWS_ITEM_ID}:cancelSubmission`,
    { method: 'POST' },
  );

  console.log('[cancel] === レスポンス ===');
  console.log(JSON.stringify(data, null, 2));
  console.log('[cancel] ✓ 取り下げ完了。次は upload.mjs → submit.mjs');
}

main().catch((e) => {
  console.error('fatal:', e?.message ?? e);
  process.exit(1);
});
