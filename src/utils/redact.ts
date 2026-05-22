/**
 * 報告 / diagnostics 経路に流れる本文中の PII を redact する (v0.4.78〜)。
 *
 * 公開 GitHub Issue (komm64/tutti-issues) に貼られる前提で **過剰に保守的に潰す**。
 * 過去の漏えい事故 ([[privacy_url_leak_incident_2026_05_08]] 等) を防ぐための
 * 多重防御の 1 段目。 DOM snapshot 側は `src/utils/dom-snapshot.ts` で別途実施。
 *
 * 対象:
 * - `@user.name` / `@user@instance.tld` 等 → `@<redacted>`
 * - メールアドレス (RFC 5322 簡略形) → `<email-redacted>`
 * - URL の path / query / fragment → `<scheme>://<host>/<…>`
 *   - host だけ残す。 `youtube.com/watch?v=xxx` のような ID 漏れを防ぐ
 *
 * **NOT redact**:
 * - 本文の自然言語 (除外: 上記の固有 pattern のみ)
 * - 各種 ID (post id 等) 自体 ── これは個別 SNS で post URL を含めるかの判断
 *   (本 関数の責務外、 呼び出し側で慎重に)
 */
export function redactPII(text: string): string {
  return text
    // 1) Mastodon-style `@user@instance.tld` を **handle** として潰す。
    //    plain email より先に処理しないと `<email-redacted>` でラベルが混じる。
    //    境界は 行頭 or 空白 / 句読点 (mid-word @ は無視)。
    .replace(/(^|[\s\p{P}])@[\w.-]+@[\w-]+\.[\w.-]+/gu, (_m, lead) => `${lead}@<redacted>`)
    // 2) plain email (上で潰した Mastodon mention の残り、 純粋な email アドレス)。
    //    `@<redacted>` 直後を email 形式と認識しないよう、 直前文字が `@` のときは skip。
    .replace(/(^|[^@\w])([\w.+-]+@[\w-]+\.[\w.-]+)/g, (_m, lead) => `${lead}<email-redacted>`)
    // 3) X-style `@handle` (instance なし)。
    .replace(/(^|[\s\p{P}])@[\w.-]+/gu, (_m, lead) => `${lead}@<redacted>`)
    // 4) URL: scheme://host/path?q#f → scheme://host/<…>
    .replace(/(https?:\/\/[\w.-]+)(\/[^\s"'`<>]*)?/gi, (_m, base) => `${base}/<…>`);
}
