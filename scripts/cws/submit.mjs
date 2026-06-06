/**
 * Chrome Web Store の current draft を publish / review request する。
 * v1 publish は metadata-only draft で OK を返しても実状態が変わらないケースが
 * あったため、v2 publishers.items.publish を使う。
 *
 * 使い方:
 *   node scripts/cws/submit.mjs          # 承認後に通常公開 (Dashboard の配布設定通り)
 *   node scripts/cws/submit.mjs staged   # 承認後に手動 publish 待ち
 *
 * 前提: draft が存在 (= 直前に upload.mjs を成功させてる、または Dashboard で
 * description を編集して save 済) かつ Privacy practices / Permissions justifications
 * 等の必須欄が全部埋まってる。
 *
 * 失敗パターン:
 * - "Item is not ready for publishing" → 必須フィールドが空、Dashboard で確認
 * - "Cannot publish a published item" → 既に同 version で published 済 (= 何もしない)
 */

import { cwsV2Api, getPublisherId, loadEnv, requireEnv } from './_lib.mjs';

async function main() {
  const env = loadEnv();
  requireEnv(env, 'CWS_ITEM_ID');
  const publisherId = getPublisherId(env);

  const mode = process.argv[2] ?? 'default';
  if (mode !== 'default' && mode !== 'staged') {
    console.error(`不明な publish mode: ${mode} (default / staged のみ対応)`);
    process.exit(1);
  }

  const publishType = mode === 'staged' ? 'STAGED_PUBLISH' : 'DEFAULT_PUBLISH';
  console.log(`[submit] item ${env.CWS_ITEM_ID} を publish 中... (publishType=${publishType})`);

  const data = await cwsV2Api(
    env,
    `/publishers/${publisherId}/items/${env.CWS_ITEM_ID}:publish`,
    {
      method: 'POST',
      body: JSON.stringify({
        publishType,
        blockOnWarnings: true,
      }),
    },
  );

  console.log('[submit] === レスポンス ===');
  console.log(JSON.stringify(data, null, 2));

  if (data?.state === 'PENDING_REVIEW') {
    console.log('');
    console.log('[submit] ✓ 審査リクエスト成功。Dashboard では pending review / in review として表示されます。');
  } else if (data?.state === 'PUBLISHED') {
    console.log('');
    console.log('[submit] ✓ publish 成功。レビュー不要の変更として即時公開されました。');
  } else if (data?.state === 'STAGED') {
    console.log('');
    console.log('[submit] ✓ 承認済みで staged 状態です。Dashboard から手動 publish してください。');
  } else {
    console.log('');
    console.log(`[submit] state: ${data?.state ?? '(unknown)'}`);
  }
}

main().catch((e) => {
  console.error('fatal:', e?.message ?? e);
  process.exit(1);
});
