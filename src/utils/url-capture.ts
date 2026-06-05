/**
 * 投稿後の post URL を location.href から取得する utility。
 *
 * redirect 型 SNS (Threads / Tumblr / Pixiv / DeviantArt / TikTok / YouTube) で
 * Post button click 後、 page が post-detail / studio video listing 等に
 * navigate する。 そこから定型 URL パターンを抽出して return。
 *
 * 「本当の完了 = post URL が取れた」 と user 定義 (2026-05-21)。 取れない場合は
 * 「投稿失敗」 扱いで spinner 停止 → 失敗ログ。
 */

/**
 * `location.href` を 250ms 間隔で polling し、 いずれかの pattern に最初に
 * match した URL を返す。 timeout 内に match しなければ null。
 *
 * 既にマッチした URL に居る場合は即時 return (compose ページから戻ってきた等の
 * 状況で、 polling 待ちで時間を浪費しないため)。 ただし呼び元は post click
 * 直後の compose URL から呼ぶ前提なので即 hit はレアケース。
 */
export async function waitForPostUrl(
  patterns: RegExp[],
  timeoutMs = 15000,
  pollMs = 250,
  stopPatterns: RegExp[] = [],
): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const href = location.href;
    for (const p of patterns) {
      if (p.test(href)) return href;
    }
    for (const p of stopPatterns) {
      if (p.test(href)) return null;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return null;
}
