# Tutti — Privacy Policy

Japanese version: [PRIVACY.ja.md](./PRIVACY.ja.md)
Web version: <https://tutti.komm64.com/privacy.html>

Last updated: 2026-05-23 (v0.5.0)

Tutti is a Chrome extension whose purpose is to let users cross-post the same
content (text, images, video) to multiple social networks (X, Bluesky, Threads,
Mastodon, Misskey, Tumblr, Pixiv, DeviantArt, Instagram, TikTok, YouTube) in
one click. The Tutti developer respects user privacy and follows the policy
below.

## 1. Data collected and transmitted

**Tutti has no backend server.** Post content (text, images, video) is never
transmitted to any third-party server. It travels directly from your browser
to each social network you select, exactly as if you had typed and submitted
it there yourself.

- Post text, images, and video are passed only to the SNS pages you choose,
  within your browser.
- When the optional official-API path is enabled for Bluesky / Mastodon /
  Misskey, posts are sent directly from your browser to **that SNS's own API
  server** using credentials you supplied in Settings. No Tutti / developer
  server is involved.
- No analytics, tracking, or advertising data is collected.
- Tutti does **not** read or store your authentication tokens, cookies, or
  session data from the SNS sites.

### Exception — manual error reports (opt-in per click)

When (and only when) you press the **"Report" button** shown in an error
dialog or the diagnose panel, the following is sent through a Cloudflare
Workers relay to a **private GitHub issue tracker**
(`komm64/tutti-issues`, viewable only by the Tutti developer):

- The error message, extension version, browser User-Agent string.
- The last 30 entries of the extension's internal log (the log level you
  configured; INFO by default). Post content, images, video, SNS login data,
  and API credentials are **never** included.
- A redacted DOM snapshot of the SNS tab where the error occurred, used to
  repair broken selectors. Text content, attribute values, URL paths/queries/
  fragments, `href`/`src` attributes, and `<meta>`/`<link>` tags are stripped.
  The payload is capped at 8 KB. See
  [`src/utils/dom-snapshot.ts`](./src/utils/dom-snapshot.ts) for the
  implementation.

Nothing is sent until you press the report button. The destination is
private, viewable only by the Tutti developer.

**Note (v0.4.32–v0.4.34 history):** error reports were briefly sent to a
public GitHub Issues tracker. A redaction-layer bug caused unintended
information (e.g., the URL of an open YouTube video) to appear in public
issues. From v0.4.35 onward, the destination is a **private** repository,
so even if redaction ever breaks, external observers cannot see the content.

## 2. Locally stored data

The following is stored only inside your browser via Chrome's `storage` API.
Nothing is transmitted off-device by Tutti.

- **Settings** (`chrome.storage.sync`): Mastodon / Misskey instance URLs,
  autoPost toggle, display mode, selector override URL, etc. May be
  replicated to your other devices via Chrome Sync if you are signed into
  Chrome.
- **Drafts** (`chrome.storage.session`): In-progress post text and attached
  media (images / video). Auto-cleared when the browser exits.
- **Selected SNS** (`chrome.storage.local`): The SNS you ticked as post
  targets. Persists across sessions for convenience; device-local only.
- **Last seen usernames** (`chrome.storage.local`): The currently-logged-in
  username on each SNS, displayed in the popup so you can confirm which
  account will receive the post. Device-local only.
- **Post history** (`chrome.storage.local`): The last 20 posts: first 80
  characters of text, target platforms, success/failure per platform, and
  timestamp. Device-local only.
- **API credentials** (`chrome.storage.local`): Only if you explicitly
  enabled the official-API path for Bluesky / Mastodon / Misskey: your
  Bluesky app password or Mastodon / Misskey access token.
  **Device-local only; never replicated via Chrome Sync; never transmitted
  to any developer server.** Removable from the Settings wizard.
- **Selector override cache** (`chrome.storage.local`): Selector hot-fix
  data fetched from the URL you configured in Settings (default: the public
  `selectors.json` at <https://tutti.komm64.com/selectors.json>).
- **Video upload limit cache** (`chrome.storage.local`): Result of API
  probes for per-account video upload caps (e.g., Bluesky). Numeric values
  only; no credentials.

All of this can be wiped at any time by uninstalling the extension or
clearing Chrome's extension storage.

## 3. Permissions used

| Permission | Purpose |
|---|---|
| `storage` | Store the local data above (settings, drafts, history, selected platforms, etc.) inside your browser. |
| `offscreen` | Run `ffmpeg.wasm` in an offscreen document to compress / re-encode video files when the source exceeds the destination SNS's size cap. Video data is processed locally only; not transmitted anywhere by Tutti. |
| `sidePanel` | Optional UI display mode: show Tutti's compose form in Chrome's side panel instead of the action popup, so it stays open while you switch between SNS tabs. You opt in via the Options page; default is the standard popup. |
| `host_permissions` | Inject content scripts into each SNS site (x.com / twitter.com / bsky.app / bsky.social / threads.net / threads.com / mastodon.social / misskey.io / tumblr.com / pixiv.net / tiktok.com / youtube.com / instagram.com / deviantart.com) to fill the compose form with your post content and submit it, on your behalf. No data is read from these sites and sent elsewhere; the content script only writes your own input. |
| `optional_host_permissions: https://*/*` | Requested at runtime only if you configure a custom Mastodon or Misskey instance URL (other than the defaults). Chrome shows the standard permission prompt at that moment. |

## 4. Relationship with the SNS providers

Tutti automates the web UI of (or, optionally, posts via the official API
of) the 11 supported networks. This is unofficial functionality; Tutti is
not affiliated with X, Bluesky, Meta (Threads / Instagram), Mastodon gGmbH,
Misskey, Tumblr, Pixiv, DeviantArt, TikTok, or YouTube. You remain bound by
each service's own terms of use.

## 5. Contact

- GitHub Issues: <https://github.com/komm64/tutti/issues>
- Email: <contact@komm64.com>

## 6. Changes to this policy

Updates to this policy are communicated by updating this file and the web
version at <https://tutti.komm64.com/privacy.html>.
