# Surface to CWS release flow

Use this flow for fixes that affect posting, media attach, or URL capture.

## Gate

Always start with:

```powershell
git status --short --branch
node scripts/cws/status.mjs
```

Do not upload to CWS until the Surface real-browser check has passed on the
same build that will be uploaded.

## Surface check

1. Build the extension.

```powershell
npm run build
```

2. Load `.output/chrome-mv3` into the Surface browser profile used for real
   SNS checks, and expose CDP locally, usually as `http://127.0.0.1:9223`.

3. Run the target real-browser check.

```powershell
$env:E2E_CDP = 'http://127.0.0.1:9223'
$env:IMAGE_PATH = 'scripts/e2e/fixtures/test-image.png'
$env:PLATFORMS = 'threads,tumblr'
node scripts/e2e/surface-url-capture-check.mjs
```

For preview-only diagnosis:

```powershell
$env:AUTOPOST = 'false'
node scripts/e2e/surface-url-capture-check.mjs
Remove-Item Env:AUTOPOST -ErrorAction SilentlyContinue
```

Preview-only runs are expected to fail URL assertions. For release gating,
use `AUTOPOST=true` and require `PASS`.

## Submit

After Surface PASS:

```powershell
npm run compile
npm test
npm run zip
node scripts/cws/upload.mjs
node scripts/cws/status.mjs
node scripts/cws/submit.mjs
node scripts/cws/status.mjs
```

Commit and push the exact code and version used for the uploaded zip.

```powershell
git status --short --branch
git add <release files>
git commit -m "..."
git push
```

## Monitor

After submit, check every 30 minutes until the submitted version is published.

```powershell
node scripts/cws/watch-status.mjs --interval-minutes 30
```
