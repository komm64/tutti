# CI / E2E setup for Tutti

Documents how to bootstrap the two test runners and the secrets needed for
nightly runs. Once these are set up, GitHub Actions workflows in
`.github/workflows/` will keep `selectors.json` and the API path honest.

## 1. API E2E (GitHub-hosted runner)

The API path (`src/api/{bluesky,mastodon,misskey}.ts`) is independent of any
SNS DOM and can be exercised from any Linux runner. Nightly cron checks that
posting via official API still works.

### Secrets (Settings → Secrets and variables → Actions)

Register these on `komm64/tutti`:

| Secret | Where to get it |
|---|---|
| `E2E_BLUESKY_IDENTIFIER` | Test account handle, e.g. `tutti-test.bsky.social` |
| `E2E_BLUESKY_PASSWORD` | App Password from Settings → Privacy and Security → App Passwords (NOT the main password) |
| `E2E_MASTODON_INSTANCE` | `https://mastodon.social` (no trailing slash) |
| `E2E_MASTODON_TOKEN` | `/settings/applications` → new application with scope `write:statuses`, `write:media` |
| `E2E_MISSKEY_INSTANCE` | `https://misskey.io` |
| `E2E_MISSKEY_TOKEN` | Settings → API → "アクセストークン発行" with `write:notes`, `write:drive` |

Setting only a subset is fine — the workflow skips platforms without
credentials.

### Local trial run

```bash
export E2E_BLUESKY_IDENTIFIER=...
export E2E_BLUESKY_PASSWORD=...
npm run test:e2e-api
```

vitest exercises `scripts/e2e-api/*.test.ts` which post → verify URL →
deleteRecord cleanup. Test feeds stay clean.

### Failure modes worth knowing

- `createSession 401` → app password was rotated; reissue
- `createRecord 400` → schema drift on the SNS side (rare); inspect the
  response body and patch `src/api/<sns>.ts`
- 1000s of `429` in a row → rate-limit pressure; back off cron frequency

## 2. DOM E2E (self-hosted runner)

DOM-driven posting (X / Tumblr / Pixiv / IG / TikTok / YouTube / DA) needs a
real Chromium + a logged-in user data dir. We use a self-hosted runner so
this lives on hardware the maintainer owns.

### Ubuntu CLI option

Best for nightly cron. Headless via xvfb.

```bash
# 1. Register self-hosted runner
#    GitHub → komm64/tutti → Settings → Actions → Runners → New self-hosted runner
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-linux-x64-2.XXX.X.tar.gz -L <url-from-github>
tar xzf actions-runner-linux-x64-2.XXX.X.tar.gz
./config.sh --url https://github.com/komm64/tutti --token <token> \
  --labels self-hosted,linux,ubuntu --name tutti-ubuntu

# 2. Run as a systemd service (= survives reboot)
sudo ./svc.sh install
sudo ./svc.sh start

# 3. Prereqs
sudo apt update
sudo apt install -y xvfb chromium-browser nodejs npm  # Node 20+ recommended

# 4. Playwright Chromium
cd /home/<user>/actions-runner/_work/tutti/tutti
npx playwright install chromium

# 5. Persistent profile + log into each test account
export E2E_USER_DATA_DIR=/home/<user>/.config/tutti-e2e-chrome
xvfb-run -a npx playwright open --user-data-dir=$E2E_USER_DATA_DIR https://x.com/login
# Repeat for each network. SSH X11 forward or VNC if Ubuntu is headless.
```

### Surface (Windows) option

Best for manual debugging / visual confirmation. The maintainer's existing
Surface box can act as a runner too.

```powershell
# Register runner
mkdir C:\actions-runner
cd C:\actions-runner
# Copy the Windows x64 command from the GitHub runners page
.\config.cmd --url https://github.com/komm64/tutti --token <token> `
  --labels self-hosted,windows,surface --name tutti-surface

# Install as service
.\svc.cmd install
.\svc.cmd start

# Node 20+ from https://nodejs.org/, then Playwright Chromium
cd C:\actions-runner\_work\tutti\tutti
npx playwright install chromium

# Persistent profile
$env:E2E_USER_DATA_DIR = "$env:USERPROFILE\.tutti-e2e-chrome"
npx playwright open --user-data-dir=$env:E2E_USER_DATA_DIR https://x.com/login
```

If SSH-launched processes land in session 0 (= no GUI, dummy renderer),
launch via a scheduled task with `LogonType Interactive` so the
process inherits session 1. See `tools/surface_*` in the chicken-climber
repo for a reference implementation pattern.

### Invoking a DOM smoke run

After the runner is registered:

```
GitHub → komm64/tutti → Actions → "E2E real-post smoke" → Run workflow
  - platforms: x  (or x,bluesky,...)
  - runner: ubuntu  (or surface)
```

Locally:

```bash
# Ubuntu / xvfb
xvfb-run -a npm run e2e -- --platforms x

# Surface (real display)
npm run e2e -- --platforms x
```

### Operational notes

- **Use test accounts only**. Banning the maintainer's main account costs
  more than the runner saves. Reuse `tutti-test*` style sub-accounts kept
  out of production posts.
- **Throttle**: per network, at most a handful of posts per day. Run
  nightly cron, not on every PR.
- **YouTube / Instagram are touchy**: anti-bot gates are aggressive. If
  these fail repeatedly, take them out of the cron and run them only on
  selector-PR validation.
- **Always clean up**: test posts get deleted at the end of the run. If a
  run crashes, the test account timeline gets noisy — fine for sub
  accounts, breaks main accounts.
- **Artifacts on failure**: workflows save screenshots + console logs to
  GH Actions artifacts and `gh pr comment` them onto the triggering PR.

## 3. Bootstrapping recipe summary

If you're standing this up from zero:

1. Pick **API E2E first** — register the 6 secrets, watch the nightly job
   go green for a week.
2. Once the API path is observed clean, **add the Ubuntu runner** for DOM
   smoke. Cron at 03:00 JST or wherever it doesn't fight maintainer dogfood.
3. Add the **Surface runner** last, as a manual-debug counterpart for
   inspecting selector-PR proposals visually.

Then turn on auto-triage gating: auto-triage PRs only merge if both the API
E2E and the relevant DOM smoke jobs pass on that PR.

## 4. Auto-triage (private issue repo -> public selector PR)

User reports are filed into the private `komm64/tutti-issues` repository, not
this public repository. That workflow uses `openai/codex-action@v1` to analyze
the private diagnostic payload, edit a checkout of public `komm64/tutti`, and
then create a public selector PR from a trusted shell step.

Required secrets on `komm64/tutti-issues`:

| Secret | Purpose |
|---|---|
| `OPENAI_API_KEY` | Used by `openai/codex-action@v1` to run Codex in CI. |
| `TUTTI_PUBLIC_REPO_PAT` | Fine-grained PAT for `komm64/tutti` with Contents: Write and Pull requests: Write. |

Keep the report workflow in the private repo. Do not move it back into
`komm64/tutti`; even redacted DOM snapshots should not pass through public
issues or public workflow logs.
