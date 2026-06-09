# Tutti FAQ

Common questions about Tutti, the Chrome extension that cross-posts to
multiple social networks at once.

## Posting

### Which networks does Tutti support?

X (Twitter), Bluesky, Threads, Mastodon, Misskey, Tumblr, Pixiv,
DeviantArt, Instagram, TikTok, and YouTube Shorts.

### Does Tutti store my passwords?

No. Tutti uses your existing browser sessions to drive each network's
compose page — the same logged-in tab you already have open. No
passwords pass through the extension.

The only credentials Tutti can store are **optional** API keys for
Bluesky, Mastodon, and Misskey (the "Advanced — API integration" section
in Settings). When set, posts go through the official API instead of
opening a tab. Keys live in `chrome.storage.local` on your device only.

### Will Tutti post twice if I click multiple times?

Tutti disables the Post button while a job is in flight, so accidental
double-clicks won't trigger a second submission. Each post job also gets
an Idempotency-Key for the API path (Mastodon).

### Why does Tutti open compose pages but not click Post?

That's **Preview mode** (the default). Tutti opens each network's
compose page with your text/media filled in, then stops — you eyeball
the preview and click Post yourself.

Flip **Auto-post** on in the popup once you trust the preview to publish
automatically.

### What's the difference between Auto-open never / on-issue / always?

After Tutti posts successfully, it verifies the post by reading the
post page back. If the verification finds an issue (e.g. caption
stripped, image missing), Tutti can auto-open the post URL so you can
confirm immediately.

- `never`: Tutti never opens the post page (you click `✓↗` to see it).
- `on-issue` (default): Tutti opens the post page only when verify
  detects a problem.
- `always`: Tutti opens every successful post in a new tab.

`always` is heavy with multi-network posts (one tab per network), but
useful when you're verifying a new workflow.

## Multi-account

### What if I have two X accounts? Will Tutti post to the wrong one?

Tutti tracks which account it last saw on each network and checks again
right before posting. If you switched accounts since the popup opened,
Tutti aborts the post and tells you which account it expected vs. which
one is now active. No silent crossposts to the wrong account.

If you want to post from the other account, switch in the network's
tab, reopen Tutti's popup (it'll refresh the account display), and try
again.

### Why does a network show "未確認 ↗" / "Unconfirmed ↗" in the popup?

That network's tab isn't open in your browser, so Tutti hasn't detected
who you're signed in as. Click the `↗` icon to open the network in a
new tab — once you're signed in, Tutti will detect your account on the
next popup open.

## Media

### Tutti rejected my video as too long. Can I trim it?

If your video is longer than the shortest selected network's cap
(usually 60s for TikTok / IG / YouTube Shorts), Tutti shows a
`N 秒に切り詰めて投稿 ✂` / `Trim to Ns and post ✂` button. Click it to
trim to that length before posting. The original file isn't modified.

### Does Tutti resize my images?

Yes, per-network. Each image is scaled down (using Canvas / JPEG 0.85)
to fit each network's per-image cap. Bluesky's 1 MB cap doesn't drag
down the quality on X (5 MB) or Pixiv (30 MB).

### Can I add alt text to images?

Yes. Below each thumbnail in the popup there's an alt text input. The
alt is sent via Bluesky's blob alt and Mastodon's `description` field.
Other networks ignore it (some don't expose alt in their compose UI).

### Will Tutti letterbox my landscape video to 9:16 for vertical
networks?

Off by default. Enable **「動画の自動整形」 / Auto-letterbox vertical
videos** in Settings to opt in. When on, landscape videos are
re-encoded to 1080×1920 with a blurred background for TikTok, YouTube
Shorts, and Instagram Reels. The same letterboxed file is sent to all
selected networks, so landscape SNS (X, Bluesky, etc.) also see the
9:16 version.

## Verification

### What does the ✓⚠ or ⚠↗ icon mean?

After posting, Tutti reads the post page back to confirm the content
landed correctly:

- `✓↗`: success, click to open the post.
- `✓⚠`: success but a warning (e.g. tags didn't reach the dedicated
  tags field on Pixiv / DeviantArt / YouTube / Tumblr).
- `⚠↗`: error detected (caption stripped, image missing). Click to
  open the post and check.

Click the icon to see the detail tooltip; click the link to jump.

### A post failed. How do I retry just that one?

Click the red `✗ ⓘ` in the failed row. A hint card appears with:
- the likely reason (login required, captcha, size over, etc.)
- a one-line guidance
- action buttons: **Retry**, **Open SNS ↗**, **Report**, **Close**

Or use the global **失敗だけ再送** / **Retry failed** button below the
SNS list to retry all failures at once.

## History

### How do I find an old post?

Click 履歴 / History in the popup header. Use the search box to filter
by text content, or the dropdown to filter by status (All / Has
failures / All succeeded). Click a network badge to jump to that post.

### Can I retry a post from the history?

Yes — entries with failures show a 「失敗 SNS だけ復元 ↻」 / "Restore
failed networks" button. Tutti puts the original text back in the
editor and pre-checks the failed networks. Reattach media if needed,
then post.

## Privacy

### Does Tutti send my posts to a third-party server?

No. Posts go directly from your browser to each network. The only
external service Tutti talks to is a Cloudflare Workers proxy for bug
reports, and that only fires when you press the Report button.

See https://tutti.komm64.com/privacy.html for the full breakdown.

### How does Tutti remove PII from bug reports?

The popup runs `redactPII` on any text leaving the browser:
- `@handle` / `@user@instance.tld` → `@<redacted>`
- email → `<email-redacted>`
- URL path / query → `scheme://host/<…>`

Plus a separate DOM-snapshot redactor strips attribute values that
could carry IDs. Reports go to the public
`komm64/tutti-issues` repo, so the redaction is intentionally
aggressive.

## Tutti-specific

### Why is the build 30 MB?

ffmpeg.wasm (single-thread H.264 / AAC encoder) ships in the extension
for local video compression. MV3 doesn't allow loading WebAssembly
from remote URLs, so the 25 MB wasm file is bundled. The rest of
Tutti is < 1 MB.

### Where's the source code?

https://github.com/komm64/tutti

### How do I report a bug?

Click 「この問題を報告」 / "Report this issue" in the popup error
dialog. Tutti drafts a redacted GitHub issue body with logs +
diagnostics + a redacted DOM snapshot.

### Will there be a mobile version?

iOS Share Sheet / Android Intent integration is in the v3 roadmap.
For now, Tutti is Chrome / Chromium browser only.
