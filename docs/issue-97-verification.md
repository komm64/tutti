# Issue #97: X third-editor timeout

Status on 2026-09-23: **two defects fixed; broader hidden-start gate still fails.
Not committed or released.**

Report: <https://github.com/komm64/tutti-issues/issues/97>, version 0.5.55,
798 characters, three X chunks, no media, `visibility=hidden`.

## Findings and changes

1. Each thread item has its own Add post toolbar. Selecting the first button
   in a matching dialog inserts a blank item in the middle of the thread.
   Surface reproduced chunk 2 moving to index 2 while index 1 became empty.
   The selector now requires the preceding chunk's index, exact normalized
   text, and its own toolbar. Ambiguous containers are rejected.
2. In a genuinely inactive tab, moving DOM focus to Add can omit blur/focusout.
   X then rebuilds the thread without committing the edited chunk. A native
   Surface trace reproduced loss of chunk 2 when adding chunk 3. The X Add
   command now delivers only missing blur/focusout events, before its existing
   single Enter activation. Native event delivery is observed to avoid a
   duplicate commit. No React internals or extra click/retry are used.

The earlier proposed native `.click()` change was rejected: it could discard
the draft. X's existing Enter path is retained. No other platform runtime,
timing policy, or submission behavior was changed.

## Artifact and environment

- Host: `surfacepro7`, reached through SSH alias `surface` and local CDP 9223.
- Brave in the real interactive desktop, Chromium 153.0.8010.53.
- Development manifest version **0.5.55**, not a new release.
- Extension ID: `abjfppgfgdbcdcinfoajdnhkbpdbchbm`.
- Staged ZIP SHA256:
  `71386EC5AF4712B1645A3170EFD375F5E42136ED1F56DA01402F228E56BFCE95`.
- Source branch: `fix/x-thread-97`, based on `a055daf`.

## Verification

Local `npm run verify:commit`: PASS, 978 unit tests, 119 architecture tests,
TypeScript, production build. Regressions were demonstrated failing before
each fix. The script catalog and syntax checks also pass.

Native hidden-tab test (no Playwright connection or focus emulation):

```powershell
$env:E2E_CDP = 'http://127.0.0.1:9223'
$env:E2E_EXTENSION_ID = 'abjfppgfgdbcdcinfoajdnhkbpdbchbm'
node scripts/e2e/surface-x-hidden-thread.mjs --hide-at ready --repeat 2 --summary-json C:\CodexTemp\tutti\20260923-x97-surface-b7c4\hidden-ready.json
```

Both iterations PASS: 13,628 ms and 12,318 ms, default attempt (no retry).
The tab was genuinely hidden while building; all three numbered editors
matched the expected text exactly. Each run recorded 12 complete-hidden
samples. `preview=true`, `flow.submitReached=false`, no post URL, history
unchanged. Tags/media: N/A; no real post was made.

Affected foreground preview matrix also PASS (four iterations, no failures):

```powershell
node scripts/e2e/surface-posting-matrix.mjs --mode preview --platforms x --cases text-thread-three,long-text-image --repeat 2 --summary-json C:\CodexTemp\tutti\20260923-x97-surface-b7c4\x-final-matrix.json
```

This verifies the three-part text fixture twice and the existing long-text plus
image case twice. Preview contracts include no submission, post URL, or history
write. It is not the full cross-platform matrix and is not hidden-tab evidence.

Stricter initialization test:

```powershell
node scripts/e2e/surface-x-hidden-thread.mjs --repeat 2 --summary-json C:\CodexTemp\tutti\20260923-x97-surface-b7c4\hidden-final.json
```

**FAIL:** iteration 1 timed out adding chunk 2 after 95,367 ms; iteration 2
passed in 12,509 ms. A separate initial run passed after a retry in 46,304 ms.
Hiding X from navigation (before its composer initializes) remains unstable.
This failure is retained, not replaced by the ready-composer PASS. The default
native test continues to exercise the stricter condition.

Playwright-based inactive-tab observations are not native-hidden evidence:
Playwright enables focus emulation on CDP-attached pages. An independent CDP
session setting it to false did not undo that connection's emulation, so that
ineffective observer was removed and replaced by the Puppeteer-only test.

## Remaining gates

- Diagnose/fix the separate hidden-during-initialization failure above.
- Run the full applicable Surface preview matrix twice before committing.
- Version and build the final artifact, then test the affected real-post case
  on Surface and verify all three published chunks before CWS upload.
- CWS status currently fails token refresh with `invalid_grant`; authentication
  must be restored by the owner before release actions.

No issue was closed; no version bump, commit, upload, submission, or real post
was performed. Pre-existing user changes to `AGENTS.md` were preserved.
