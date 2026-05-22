# Changelog

All notable changes to Tutti are recorded here.
Versioning is semver-ish during the v0.4.x beta — minor numbers tick on
features and major bug fixes; patches roll up smaller polish.

## v0.4.77 — Post-verify completion (2026-05-22)

- **Auto-open post URL** (`Settings.autoOpenPostUrl`): three modes — `never`,
  `on-issue` (default; opens post URL when verify detects silent strip /
  missing image), `always` (opens every successful post). Options dropdown added.
- **DOM verify fallback**: when server-side `og:meta` fetch hits a login wall,
  Tutti opens the post URL in a logged-in tab, reads `<meta og:*>` via the new
  `verify-helper.content.ts`, then closes the tab.
- 148 unit tests pass.

## v0.4.76 — og:meta verify for 8 SNS (2026-05-22)

- 8 SNS (X / IG / Threads / Tumblr / Pixiv / DA / TikTok / YouTube) get
  post-verify via `verifyViaOg` — `fetch` HTML + regex-extract
  `<meta property="og:description">` and `og:image`.
- Per-SNS `cleanDescription` normalizers strip platform-specific prefixes
  (Instagram's `"X likes, Y comments - user: ..."`, etc.).
- `extractMetaContent` handles both attribute orders and HTML entities;
  works in MV3 SW where DOMParser is unavailable.

## v0.4.75 — Post-verify framework + Bluesky/Mastodon/Misskey API verify (2026-05-22)

- `src/utils/post-verify.ts` framework: `VerifyExpectation` / `VerifyResult`
  types, `fuzzyContainsText` 8-char chunk match (resilient to URL strip /
  emoji conversion / hashtag link wrap), `buildVerifyResult` aggregator.
- Public-API verify for Bluesky (`app.bsky.feed.getPostThread` + `resolveHandle`),
  Mastodon (`/api/v1/statuses/:id`), Misskey (`/api/notes/show`).
- `PostResultMessage.verify` added; popup shows `✓⚠` for warn,
  `⚠↗` for error with tooltip details.

## v0.4.74 — DA tags input + description lazy-mount fixed (2026-05-22)

- DeviantArt tags `<input>` has no `name` / `aria-label`; selector changed
  to placeholder-based (`E.g.: rose, watercolor, painting, fanart, tutorial`).
- DA description editor confirmed fully lazy-mount: triggered by clicking
  `data-editor-viewer` + `empty-p` placeholder.

## v0.4.73 — Tumblr tags textarea (2026-05-21)

- Tumblr tags editor is a `<textarea aria-label="Tags editor">`, not an
  `<input>`. `tag-list` mode extended to accept textarea.

## v0.4.72 — Hashtag chip fields for DA / YouTube / Tumblr (2026-05-21)

- Generic `extractHashtags(text, { maxCount, maxLen, defaultIfEmpty? })`
  utility, lifted from Pixiv's specialized function.
- `executePostFlow.beforeSubmit?` hook lets Tumblr inject tags before the
  Post Now button click.
- YouTube clicks "Show more" to expose the Details tags field.

## v0.4.71 — DA description editor lazy-mount support (2026-05-21)

- Probe found DA description editor mounts on user click; `fill-description`
  step clicks the Description label area to trigger mount, polls up to 5s.

## v0.4.70 — Tab load race (`waitForTabComplete`) (2026-05-21)

- `openOrFocusTab` now installs the `onUpdated` listener **before**
  `tabs.update`, and additionally polls `tabs.get` every 250ms — same-URL
  navigation no longer hangs on the missing `complete` event.

## v0.4.69 — IG caption silent strip workaround (2026-05-21)

- Network probe showed IG's `/api/v1/media/configure/` POST had `caption=&`
  even after Lexical state was populated (probably anti-bot gating on
  React state propagation).
- `inject-helper` installs a MAIN-world fetch/XHR hook on `instagram.com`;
  when the configure request fires, the empty `caption=` is replaced with
  the pending caption text stored in `window.__tuttiIgPendingCaption`.

## v0.4.68 — Bluesky reply chain (2026-05-21)

- `chunks > 1` now post as a true reply chain instead of two independent
  posts. Background pulls the ATProto session JWT either from saved
  Settings credentials or from `bsky.app`'s `localStorage`, then uses
  `postViaSession` with `reply.root` / `reply.parent` set.

## v0.4.67 — X reply chain (2026-05-21)

- Replaces the broken "Add post" inline thread approach. Background captures
  chunk 0's tweet URL, extracts the tweet id, and posts chunk 1 with
  `https://x.com/intent/post?in_reply_to=<id>` (probe confirmed
  `in_reply_to=`, **not** `in_reply_to_status_id=`).

## v0.4.66 — X selector untangling (2026-05-21)

- Reverted unsafe thread chaining; X's chunks fall back to the generic
  loop, posting each chunk as a separate tweet (later upgraded to reply
  chain in 0.4.67).

## v0.4.65 — Multi-chunk + image bug bundle (2026-05-21)

- **Bluesky**: chunks > 1 post both halves; previously chunk 0 dropped
  silently while chunk 1 went through. Added modal-close verification
  after Publish click.
- **Instagram**: caption now polled for real reflection after inject;
  retry on Lexical state mismatch.
- **X**: tweet textareas now match `[data-testid^="tweetTextarea_"]`
  (later removed when reply chain landed in 0.4.67).

## v0.4.64 — i18n bug + 11-SNS screenshots (2026-05-15)

- Fixed `errorDialogOpenGitHub` localization regression.
- CWS listing screenshots regenerated to include all 11 networks; AI-generated
  live-concert image replaces pink placeholder.

## v0.4.63 — Posting state in background (2026-05-18)

- `postingState` (pending set + results) now lives in background, not just
  popup. Re-opening the popup mid-post no longer rewinds progress UI to 0.
- Per-platform concurrency capped at 3 (was full parallel; 11-SNS posting
  was unreliable).

## v0.4.62 — IG image letterbox (2026-05-17)

- Wide / tall photos auto-letterboxed to square + blurred background on the
  Tutti side so IG's default 1:1 crop doesn't lop off detail.

## v0.4.61 — IG "Original" aspect ratio auto-select (2026-05-17)

- `fill-caption` step opens the crop popover and clicks Original to keep
  the source aspect ratio when letterboxing is off.

## v0.4.60 — IG popover variant for Create (2026-05-17)

- Some IG accounts get a `+` popover ("Post / Live video / Ad") before the
  upload modal. Tutti now detects and clicks "Post" to advance.

## v0.4.59 — Image-only post fix (2026-05-16)

- X / Tumblr / IG can now post with an image and no body. Previous
  injectText returned `ok: false` on empty text and broke the flow.

## v0.4.58 — Auto-retry + 失敗 SNS 再送 (2026-05-16)

- 1 chunk fail re-tries once after 1.5s (autoPost only).
- Popup shows a "Retry failed only" button after a multi-SNS post if any
  platform failed; it re-submits only those platforms.

## v0.4.57 — Hashtag handling polish (2026-05-14)

- Boundary-aware splitting keeps `#hashtag` intact across chunks.
- Bluesky gets proper rich-text facets (tag + URL annotations).
- Pixiv tag extraction tightened.

## v0.4.56 — Mastodon channel-close + X thread chaining (2026-05-14)

- Mastodon's tab-reload-after-post no longer surfaces as an error.
- First attempt at X thread chaining via the inline "Add post" button.

## v0.4.55 — IG Create 2-click + diagnose (2026-05-13)

- Two-step Create click + extra dialog detection.

## v0.4.54 — IG post completion verify (2026-05-13)

- Verify Share click actually produces a post (dialog closes / success
  banner appears) instead of treating click as success.

## v0.4.53 — ffmpeg silent-failure fix (2026-05-10)

- `-tune zerolatency,fastdecode` produced 0-byte output silently with
  ffmpeg.wasm's x264 build. Reverted to `zerolatency` only.

## v0.4.52 — Report dedup toggle (2026-05-09)

- 24h client-side dedup of identical bug reports can be disabled in Settings
  for individual dev use.

## v0.4.51 — 0-byte binary detection (2026-05-09)

- Three-layer detection so a broken compress / fetch doesn't propagate as a
  cryptic post failure.

## v0.4.50 — Bluesky 100MB + perf tuning (2026-05-09)

- Bluesky video cap raised to use the API-probed actual limit.
- ffmpeg compression speed improvements (later partially reverted in 0.4.53).

## v0.4.49 — Compression 100% stuck fix (2026-05-08)

- Popup now receives the conversion-complete broadcast; progress bar no
  longer freezes at 100%.

## v0.4.48 — Post-button enable wait + 120s video timeout (2026-05-08)

- Wait for the platform's Post button to become enabled before clicking,
  rather than treating disabled as a fatal mismatch.

## v0.4.47 — Chunked binary fetch (2026-05-08)

- Large media (compressed video) now flows from background → content
  script via `GET_BINARY_CHUNK` 30MB-by-30MB to avoid the 64MB
  `tabs.sendMessage` cap.

## v0.4.46 — Compression progress survive popup reopen (2026-05-08)

- Background remembers `compressionStateInMemory`; reopened popup restores
  the bar.

## v0.4.45 — Reverted ffmpeg-core-mt hang (2026-05-08)

- Multi-thread ffmpeg core hung on some Surface runs; back to single thread.

## v0.4.44 — ffmpeg-core-mt + -threads 0 (2026-05-08)

- Multi-thread compression. (Then reverted in 0.4.45.)

## v0.4.43 — CSP fix + CWS Publish API CLI (2026-05-07)

- Removed invalid `worker-src blob:` from manifest CSP that MV3 rejected
  during build.
- New `scripts/cws/` CLI: `auth.mjs`, `status.mjs`, `upload.mjs`,
  `submit.mjs` driven by OAuth2 refresh token.

## v0.4.42 — Compression perf (2026-05-07)

- ultrafast preset + 720p downscale + ETA shown in popup.

## v0.4.41 — ffmpeg ESM build (2026-05-07)

- Switched to ESM build so Worker module env can import correctly.

## v0.4.40 — Dynamic video size cap (P17) (2026-05-06)

- Effective `maxBytes` chain: code default → `selectors.json` override → API
  probe (Bluesky `getUploadLimits`). Reduces wasted compression on
  platforms whose limit silently moved up.

## v0.4.39 — ffmpeg load failure visible + no silent fallthrough (2026-05-06)

- Compression failure now surfaces as an explicit error rather than
  falling back to oversized upload that gets rejected anyway.

## v0.4.38 — IndexedDB binary-transfer (2026-05-06)

- Large media routed via extension's IndexedDB to bypass message-channel
  size limits.

## v0.4.37 — Draft media persistence (2026-05-06)

- Attached video survives popup close via IndexedDB. ffmpeg CSP / WAR
  entries added.

## v0.4.36 — Video size auto-compression (P16) (2026-05-06)

- ffmpeg.wasm in an offscreen document; over-limit clips compressed to the
  smallest platform's cap, then handed to each post path.

## v0.4.35 — Privacy: meta/link strip + attribute deny-by-default (2026-05-05)

- DOM snapshot in error reports strips `<meta>` / `<link>` to avoid leaking
  page-level fingerprints; attribute allowlist replaces the previous
  blocklist.

## v0.4.34 — Privacy: browsing URL leak in diagnose / report (2026-05-05)

- Diagnose / report payload only includes compose-context tabs; previously
  full URL of any open tab could leak.

## v0.4.33 — API path for Bluesky / Mastodon / Misskey (P15) (2026-05-04)

- Settings page collects credentials (Bluesky app password, Mastodon /
  Misskey access tokens). When set, post bypasses DOM and uses the
  official REST/XRPC API. Falls back to DOM if no creds.

## v0.4.32 — Clipboard paste in popup (2026-05-04)

- Paste image / video directly from clipboard into the popup textarea.

## v0.4.31 — Report spam multi-layer defense (2026-05-04)

- popup-side 24h dedup + Cloudflare Workers daily rate cap.

## v0.4.30 — Auto-triage via Claude Code action + Max OAuth (2026-05-04)

- Bug reports labeled `needs-triage` trigger
  `anthropics/claude-code-action@v1` which proposes a selector PR and
  updates `docs/selectors.json` for hot-fix delivery.

## v0.4.29 — Auto-triage pipeline (P13) (2026-05-04)

- Initial wiring of issue → AI proposal → PR → selectors.json delivery.

## v0.4.28 — Adapter content-script import cleanup (2026-05-03)

- Dropped unused imports after P12 adapter additions.

## v0.4.27 — YouTube visibility=Public auto-select (2026-05-03)

- YouTube wizard's Visibility step now clicks Public; previously left at
  default Private and the post never went live.

## v0.4.26 — Draft.js contenteditable clearing (P12-F.1) (2026-05-03)

- TikTok caption used Draft.js; clearing required `execCommand('selectAll')` +
  `execCommand('delete')` rather than the TipTap-style `selectAllChildren`.

## v0.4.25 — TikTok + YouTube real-post verified (2026-05-03)

- Five Step-Runner SNS all confirmed posting end-to-end on Surface.

## v0.4.18 — TikTok + YouTube adapters (P12-D/E) (2026-05-02)

- Both wired through `executeMultiStepFlow`. Generic `direct-post` driver
  for ad-hoc CDP testing.

## v0.4.17 — Pixiv real-post complete (2026-05-02)

- Adult content radio + Scheduled-post radio handled; autoPost goes
  through to `/en/users/<id>` redirect.

## v0.4.15 — Pixiv user detection + DA/IG probe scripts (2026-05-02)

- `data-username` priority, header-scope only, removed greedy fallback.

## v0.4.14 — Pixiv real-post field fixes (2026-05-02)

- Hidden required radios (Visible to / AI / Adult / Scheduled) filled by
  default; tag-list mode added for the chip input.

## v0.4.11 — Bug report dialog v1 (2026-05-01)

- Cloudflare Workers proxy + dialog integration. PRIVACY.md updated to
  list the relay as an explicit exception to the no-backend rule.

## v0.4.10 — Logger ring buffer + report button (2026-05-01)

- LogLevel-aware in-extension logger that survives SW sleep; popup gets a
  Report button.

## v0.4.9 — Beta badge + announcement template (2026-05-01)

- Internal-use cue that builds are beta; baseline for v0.4.x ship cycle.

---

For commits prior to v0.4.9, see `git log`.
