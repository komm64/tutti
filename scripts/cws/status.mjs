/**
 * Chrome Web Store の item の現在ステータスを取得して表示する。
 *
 * 使い方:
 *   node scripts/cws/status.mjs
 *
 * v2 fetchStatus で公開済み / 提出済み revision と直近 uploadState を表示する。
 */

import { cwsV2Api, getPublisherId, loadEnv, requireEnv } from './_lib.mjs';

function printRevision(label, revision) {
  if (!revision) {
    console.log(`${label}: (none)`);
    return;
  }
  console.log(`${label}: ${revision.state ?? '(unknown)'}`);
  if (Array.isArray(revision.distributionChannels)) {
    for (const ch of revision.distributionChannels) {
      console.log(`  - crxVersion=${ch.crxVersion ?? '?'} deployPercentage=${ch.deployPercentage ?? '?'}`);
    }
  }
}

async function main() {
  const env = loadEnv();
  requireEnv(env, 'CWS_ITEM_ID');
  const publisherId = getPublisherId(env);

  const v2 = await cwsV2Api(
    env,
    `/publishers/${publisherId}/items/${env.CWS_ITEM_ID}:fetchStatus`,
  );

  console.log('=== Chrome Web Store item status ===');
  console.log(`name: ${v2.name ?? `(publishers/${publisherId}/items/${env.CWS_ITEM_ID})`}`);
  console.log(`id:   ${v2.itemId ?? env.CWS_ITEM_ID}`);
  printRevision('published', v2.publishedItemRevisionStatus);
  printRevision('submitted', v2.submittedItemRevisionStatus);
  console.log(`lastAsyncUploadState: ${v2.lastAsyncUploadState ?? '(unset)'}`);
  console.log(`takenDown:            ${v2.takenDown ?? false}`);
  console.log(`warned:               ${v2.warned ?? false}`);

  console.log('');
  console.log('--- raw v2 response ---');
  console.log(JSON.stringify(v2, null, 2));
}

main().catch((e) => {
  console.error('fatal:', e?.message ?? e);
  process.exit(1);
});
