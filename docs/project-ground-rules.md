# Project Ground Rules

These rules apply to all Tutti maintenance and release work.

## Start-of-Work Gate

Before making project changes or release decisions, always check:

```powershell
git status --short --branch
node scripts/cws/status.mjs
```

## CWS Monitoring

After submitting a new Chrome Web Store version, Codex must keep the active
conversation open and check CWS status every 30 minutes. Do not treat a
background watcher process as satisfying this rule.

```powershell
node scripts/cws/status.mjs
```

Report each check result to the user. Continue until the submitted version is
published, or until the user explicitly stops the monitor. When asked for CWS
status during monitoring, run `node scripts/cws/status.mjs` before answering.

## Posting Change Commit Gate

For any change that touches posting, media attach, platform capabilities, URL
capture, history recording, tab reuse, or preview/autopost behavior, do not
commit until both gates below are satisfied on the exact code to be committed:

```powershell
npm run verify:commit
```

Then run the Surface real-browser preview matrix on the same built extension:

```powershell
$env:E2E_CDP = 'http://127.0.0.1:9223'
$env:E2E_EXTENSION_ID = '<loaded-extension-id>'
node scripts/e2e/surface-posting-matrix.mjs --mode preview --repeat 2
```

Use `--case-timeout-ms 180000` or lower when diagnosing failures so a hung SNS
is recorded as a test failure instead of blocking the whole run.

The matrix must cover, where supported by each SNS:

- text only
- image only
- text + image
- video only
- text + video
- image + video input normalized to video-only
- long text + image
- immediate repeated posting or preview (`--repeat 2` or higher)

Preview results must be `success=true`, `preview=true`, have no post URL, and
must not add post history. Real post checks may be narrower, but every selected
SNS must return `success=true`, `confirmed=true`, and a captured post URL before
a CWS upload.

Tutti currently does not support simultaneous image + video output from the
popup. If a user supplies mixed image/video files, the popup normalizes that
draft to video-only. Keep that behavior covered by unit tests unless the product
intentionally changes to true mixed-media posting.
