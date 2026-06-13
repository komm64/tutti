# Project Ground Rules

These rules apply to all Tutti maintenance and release work.

## Start-of-Work Gate

Before making project changes or release decisions, always check:

```powershell
git status --short --branch
node scripts/cws/status.mjs
```

## CWS Monitoring

After submitting a new Chrome Web Store version, immediately start 30-minute
status monitoring for the submitted version:

```powershell
node scripts/cws/watch-status.mjs --interval-minutes 30 --version <submitted-version>
```

Keep monitoring until that version is published, or until the user explicitly
stops the monitor. When asked for CWS status during monitoring, run
`node scripts/cws/status.mjs` before answering.
