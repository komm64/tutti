# A1 Visual Browser Debug

OCI A1 (`oci-a1-tokyo`) is configured as a persistent visual browser runner
for Tutti preview/debug work. Use Surface Pro 7 as the final CWS gate; use A1
for repeatable preview matrix work and visual login/debugging.

## Connect

Open noVNC over Tailscale:

```text
http://oci-a1-tokyo:6080/vnc.html
```

The VNC password is local-only scratch data:

```powershell
Get-Content .tmp\oci-a1-novnc-password.txt
```

The service stack on A1:

```text
tutti-visual-desktop.service
  Xvfb :99
  openbox
  x11vnc 127.0.0.1:5901
  noVNC  oci-a1-tokyo:6080

tutti-a1-browser.service
  Playwright Chromium on DISPLAY=:99
  CDP 127.0.0.1:9222
  Tutti unpacked from ~/tutti-a1-current/.output/chrome-mv3
```

## SSH

```powershell
$KEY = "$HOME\.ssh\oci_amd"
$A1 = "ubuntu@151.145.78.141"
ssh -i $KEY $A1
```

Tailscale name also works for browser access:

```text
oci-a1-tokyo
```

## Sync Current Workspace To A1

From the local Tutti repo:

```powershell
New-Item -ItemType Directory -Force .tmp | Out-Null
tar -czf .tmp\tutti-a1-src.tgz `
  --exclude=.git `
  --exclude=node_modules `
  --exclude=.output `
  --exclude=.wxt `
  --exclude=.tmp `
  --exclude=test-data `
  --exclude=tmp `
  --exclude=public/_locales `
  --exclude=public/ffmpeg `
  --exclude=.env `
  --exclude=.env.local `
  --exclude=.env.*.local `
  .

scp -i $KEY .tmp\tutti-a1-src.tgz ${A1}:incoming/tutti-a1-src.tgz
ssh -i $KEY $A1 "rm -rf ~/tutti-a1-current && mkdir -p ~/tutti-a1-current && tar -xzf ~/incoming/tutti-a1-src.tgz -C ~/tutti-a1-current"
```

Then on A1:

```bash
cd ~/tutti-a1-current
npm ci
npx playwright install --with-deps chromium
npm run compile
npm test
npm run build
sudo systemctl restart tutti-a1-browser.service
```

## CDP Tunnel

CDP is bound to A1 localhost. Tunnel it from Windows when running local
Playwright scripts against the A1 browser:

```powershell
$KEY = "$HOME\.ssh\oci_amd"
$A1 = "ubuntu@151.145.78.141"
$p = Start-Process -FilePath ssh -ArgumentList @('-i',$KEY,'-N','-L','9224:127.0.0.1:9222',$A1) -PassThru -WindowStyle Hidden
New-Item -ItemType Directory -Force .tmp | Out-Null
Set-Content -Path .tmp\a1-ssh-cdp.pid -Value $p.Id
Invoke-RestMethod -Uri http://127.0.0.1:9224/json/version -TimeoutSec 8
```

Current A1 unpacked extension ID:

```text
pnnnpeggkapcplenhofpiaikoadhkfnj
```

Run the matrix against A1 after logging in through noVNC:

```powershell
$env:E2E_CDP = 'http://127.0.0.1:9224'
$env:E2E_EXTENSION_ID = 'pnnnpeggkapcplenhofpiaikoadhkfnj'
node scripts/e2e/surface-posting-matrix.mjs --mode preview --repeat 2 --case-timeout-ms 180000
```

Or run it directly on A1 without a local tunnel:

```powershell
ssh -i $KEY $A1 "cd ~/tutti-a1-current && E2E_CDP=http://127.0.0.1:9222 E2E_EXTENSION_ID=pnnnpeggkapcplenhofpiaikoadhkfnj node scripts/e2e/surface-posting-matrix.mjs --mode preview --repeat 2 --case-timeout-ms 180000"
```

## Useful Checks

```powershell
ssh -i $KEY $A1 "systemctl --no-pager --full status tutti-visual-desktop.service tutti-a1-browser.service"
ssh -i $KEY $A1 "ss -ltnp | grep -E ':(5901|6080|9222) ' || true"
ssh -i $KEY $A1 "DISPLAY=:99 scrot -o /tmp/tutti-a1-desktop.png"
scp -i $KEY ${A1}:/tmp/tutti-a1-desktop.png .tmp\tutti-a1-desktop.png
```
