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

Use the known-good path below. Do not rely on the Surface repo checkout or
start Brave directly from an SSH `Start-Process`; SSH-launched GUI processes
can exit when the remote session ends. Stage the local build on Surface, start
Brave in the active console session through Task Scheduler, then attach through
an SSH tunnel.

1. Build the extension and stage that exact build for Surface.

```powershell
npm run build
Compress-Archive -Path .output\chrome-mv3\* -DestinationPath .tmp\surface-chrome-mv3-current.zip -Force
ssh surface powershell -NoProfile -Command "New-Item -ItemType Directory -Force C:\Users\komm64\Projects\tutti-surface-current | Out-Null"
scp .tmp\surface-chrome-mv3-current.zip surface:"C:/Users/komm64/Projects/tutti-surface-current/surface-chrome-mv3-current.zip"
```

2. Expand the staged build on Surface.

```powershell
$script = @'
$ErrorActionPreference = 'Stop'
$base = 'C:\Users\komm64\Projects\tutti-surface-current'
$zip = Join-Path $base 'surface-chrome-mv3-current.zip'
$ext = Join-Path $base 'chrome-mv3'
if (-not (Test-Path -LiteralPath $zip)) { throw "zip not found: $zip" }
if (Test-Path -LiteralPath $ext) { Remove-Item -LiteralPath $ext -Recurse -Force }
New-Item -ItemType Directory -Force -Path $ext | Out-Null
Expand-Archive -LiteralPath $zip -DestinationPath $ext -Force
(Get-Content -Raw -LiteralPath (Join-Path $ext 'manifest.json') | ConvertFrom-Json).version
'@
$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
ssh surface powershell -NoProfile -EncodedCommand $enc
```

3. Start Brave on the active Surface console session.

This is the most reliable launch path found so far. It uses the logged-in
`surfacepro7\komm64` console session and the real SNS profile
`C:\Users\komm64\.tutti-e2e-chrome`.

```powershell
$script = @'
$ErrorActionPreference = 'Stop'
$task = 'TuttiSurfaceBraveE2E'
$brave = 'C:\Users\komm64\AppData\Local\BraveSoftware\Brave-Browser\Application\brave.exe'
$profile = 'C:\Users\komm64\.tutti-e2e-chrome'
$extension = 'C:\Users\komm64\Projects\tutti-surface-current\chrome-mv3'
$user = 'surfacepro7\komm64'
if (-not (Test-Path -LiteralPath $brave)) { throw "Brave not found: $brave" }
if (-not (Test-Path -LiteralPath (Join-Path $extension 'manifest.json'))) { throw "Extension not found: $extension" }
New-Item -ItemType Directory -Force -Path $profile | Out-Null
Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
$args = @(
  "--remote-debugging-port=9222",
  "--remote-debugging-address=127.0.0.1",
  "--user-data-dir=`"$profile`"",
  "--disable-extensions-except=`"$extension`"",
  "--load-extension=`"$extension`"",
  "--disable-features=ProfilePicker",
  "--no-first-run",
  "--no-default-browser-check",
  "--new-window",
  "about:blank"
) -join ' '
$action = New-ScheduledTaskAction -Execute $brave -Argument $args
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $task -Action $action -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $task
$deadline = (Get-Date).AddSeconds(30)
$last = $null
while ((Get-Date) -lt $deadline) {
  try {
    Invoke-RestMethod -Uri http://127.0.0.1:9222/json/version -TimeoutSec 2 | ConvertTo-Json -Depth 5
    exit 0
  } catch {
    $last = $_.Exception.Message
    Start-Sleep -Milliseconds 500
  }
}
throw "CDP not ready after scheduled launch: $last"
'@
$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
ssh surface powershell -NoProfile -EncodedCommand $enc
```

If this fails, first confirm the Surface console session is active:

```powershell
ssh surface quser
```

4. Open the local SSH tunnel to Surface CDP.

```powershell
$p = Start-Process -FilePath ssh -ArgumentList @('-N','-L','9223:127.0.0.1:9222','surface') -PassThru -WindowStyle Hidden
New-Item -ItemType Directory -Force .tmp | Out-Null
Set-Content -Path .tmp\surface-ssh-tunnel.pid -Value $p.Id
Invoke-RestMethod -Uri http://127.0.0.1:9223/json/version -TimeoutSec 8 | ConvertTo-Json -Depth 5
```

5. Detect the loaded Tutti extension id and verify the exact version.

```powershell
$env:E2E_CDP = 'http://127.0.0.1:9223'
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.connectOverCDP(process.env.E2E_CDP,{timeout:30000});const ctx=b.contexts()[0];const p=await ctx.newPage();await p.goto('chrome://extensions/',{waitUntil:'domcontentloaded'});await p.waitForTimeout(1000);const exts=await p.evaluate(async()=>new Promise(r=>chrome.developerPrivate.getExtensionsInfo({includeDisabled:true,includeTerminated:true},r)));console.log(JSON.stringify(exts.filter(e=>/Tutti/i.test(e.name||'')).map(e=>({id:e.id,name:e.name,version:e.version,path:e.path,enabled:e.enabled})),null,2));await p.close();await b.close();})().catch(e=>{console.error(e);process.exit(1)})"
```

Set the returned id before running real-post checks:

```powershell
$env:E2E_EXTENSION_ID = '<returned-extension-id>'
```

6. Run the target real-browser check.

For URL capture checks:

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

For X / Bluesky video attach checks:

```powershell
$env:E2E_CDP = 'http://127.0.0.1:9223'
$env:E2E_EXTENSION_ID = '<returned-extension-id>'
node scripts/e2e/verify-real-multipost.mjs --platforms x,bluesky --fixture-video --skip-extension-reload --keep-posts --text "tutti surface video verify <date>"
```

For video regressions, do not stop at `success=true`. Open the captured URLs
and confirm the post page contains the expected text plus a visible video/media
element. The previous failure mode was "success" without attached video, so
history success alone is not enough for release gating.

7. Cleanup only the processes created by this flow.

```powershell
$script = @'
$task = 'TuttiSurfaceBraveE2E'
Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
'@
$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
ssh surface powershell -NoProfile -EncodedCommand $enc

$pidText = Get-Content -Path .tmp\surface-ssh-tunnel.pid -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pidText -match '^\d+$') { Stop-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue }
Remove-Item -LiteralPath .tmp\surface-ssh-tunnel.pid -ErrorAction SilentlyContinue
```

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

After submit, checking every 30 minutes is mandatory. Codex must keep the
active conversation open, run the status command every 30 minutes, and report
each result to the user. Do not replace this with a detached/background watcher
process unless the user explicitly asks for background monitoring.

```powershell
node scripts/cws/status.mjs
```
