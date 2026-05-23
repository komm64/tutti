/**
 * Chrome Web Store の current draft を「審査リクエスト」する。
 *
 * 使い方:
 *   node scripts/cws/submit.mjs              # default visibility (Dashboard 設定通り)
 *   node scripts/cws/submit.mjs trustedTesters # Trusted testers のみに公開
 *
 * 前提: draft が存在 (= 直前に upload.mjs を成功させてる、または Dashboard で
 * description を編集して save 済) かつ Privacy practices / Permissions justifications
 * 等の必須欄が全部埋まってる。
 *
 * 失敗パターン:
 * - "Item is not ready for publishing" → 必須フィールドが空、Dashboard で確認
 * - "Cannot publish a published item" → 既に同 version で published 済 (= 何もしない)
 */

import { cwsApi, loadEnv, requireEnv } from './_lib.mjs';

async function main() {
  const env = loadEnv();
  requireEnv(env, 'CWS_ITEM_ID');

  const target = process.argv[2] ?? 'default';
  if (target !== 'default' && target !== 'trustedTesters') {
    console.error(`不明な publishTarget: ${target} (default / trustedTesters のみ対応)`);
    process.exit(1);
  }

  console.log(`[submit] item ${env.CWS_ITEM_ID} を審査リクエスト中... (publishTarget=${target})`);

  const data = await cwsApi(
    env,
    `/chromewebstore/v1.1/items/${env.CWS_ITEM_ID}/publish?publishTarget=${target}`,
    { method: 'POST' },
  );

  console.log('[submit] === レスポンス ===');
  console.log(JSON.stringify(data, null, 2));

  if (data && Array.isArray(data.status)) {
    if (data.status.includes('OK')) {
      console.log('');
      console.log('[submit] ✓ 審査リクエスト成功。 Unlisted の minor update は通常 数時間 〜 1 日 で結果が email + Dashboard に届きます (in-depth review に回されると最大 1〜3 週間)。');
    } else {
      console.warn('');
      console.warn('[submit] status:', data.status);
      console.warn('[submit] statusDetail:', data.statusDetail);
    }
  }
}

main().catch((e) => {
  console.error('fatal:', e?.message ?? e);
  process.exit(1);
});
