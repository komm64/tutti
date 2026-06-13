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
