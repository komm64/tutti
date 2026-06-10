/**
 * Bluesky post verify via XRPC (v0.4.75〜).
 *
 * postUrl (`https://bsky.app/profile/<handle>/post/<rkey>`) から AT-URI を組み立て、
 * 公開 XRPC `app.bsky.feed.getPostThread` で post detail を取得して
 * caption text / images / reply の構造を確認する。
 *
 * 認証不要 (public posts only)。 失敗時は VerifyResult.verified = false。
 */

import { buildVerifyResult, verifyError, type VerifyExpectation, type VerifyResult } from '../utils/post-verify';

const PUBLIC_XRPC = 'https://public.api.bsky.app';

interface PostRecord {
  $type?: string;
  text?: string;
  embed?: {
    $type?: string;
    images?: unknown[];
    media?: { images?: unknown[] };
    video?: unknown;
  };
}

interface PostView {
  post?: {
    record?: PostRecord;
    embed?: {
      $type?: string;
      images?: unknown[];
      media?: { images?: unknown[] };
      video?: unknown;
    };
  };
}

export async function verifyBlueskyPost(
  postUrl: string,
  expected: VerifyExpectation,
): Promise<VerifyResult> {
  try {
    // URL から handle / rkey 抽出
    const m = postUrl.match(/\/profile\/([^/]+)\/post\/([^/?#]+)/);
    if (!m) return verifyError(`Bluesky: post URL parse 失敗 (${postUrl})`);
    const handle = m[1]!;
    const rkey = m[2]!;

    // handle → did 解決
    const didRes = await fetch(`${PUBLIC_XRPC}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
    if (!didRes.ok) return verifyError(`Bluesky: resolveHandle ${didRes.status}`);
    const didData = (await didRes.json()) as { did?: string };
    if (!didData.did) return verifyError('Bluesky: resolveHandle に did なし');
    const atUri = `at://${didData.did}/app.bsky.feed.post/${rkey}`;

    // post thread 取得 (depth=0、 parent も不要なので軽い)
    const threadRes = await fetch(
      `${PUBLIC_XRPC}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(atUri)}&depth=0&parentHeight=0`,
    );
    if (!threadRes.ok) return verifyError(`Bluesky: getPostThread ${threadRes.status}`);
    const threadData = (await threadRes.json()) as { thread?: PostView };
    const post = threadData.thread?.post;
    if (!post) return verifyError('Bluesky: thread.post 不在 (post 削除済 / index 未反映?)');

    const text = post.record?.text ?? '';
    const imgList =
      post.record?.embed?.images ??
      post.record?.embed?.media?.images ??
      post.embed?.images ??
      post.embed?.media?.images ??
      [];
    const hasImages = Array.isArray(imgList) && imgList.length > 0;
    const embedJson = JSON.stringify(post.record?.embed ?? post.embed ?? {});
    const hasVideo = /app\.bsky\.embed\.video|"video"\s*:/.test(embedJson);

    return buildVerifyResult(expected, {
      text,
      hasImages,
      hasVideo,
      // Bluesky は専用 tag field 無し (inline `#word` のみ。 facets は別軸なのでここでは tag verify skip)
    });
  } catch (e) {
    return verifyError(`Bluesky verify 例外: ${e instanceof Error ? e.message : String(e)}`);
  }
}
