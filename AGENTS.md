# Tutti Agent Rules

## Surface And CWS Release Gate

- For any posting, media attach, URL capture, selector, or platform-specific fix,
  do not upload or submit a Chrome Web Store build until the affected Surface
  real-browser case has passed on the exact build artifact that will be uploaded.
- "Surface" means the helper machine reachable through the SSH config alias
  `surface`, not the raw host name `surfacepro7`. Use `ssh surface ...`.
- If `ssh surface` or Surface CDP is unavailable, stop and report the release as
  blocked. Do not submit to CWS based only on local tests, unit tests, build
  success, or previous Surface runs for a different case.
- If CWS submission happens before the required Surface gate, treat it as a
  process violation: immediately check whether it can be cancelled; if already
  published, run the missing Surface verification at once and roll forward with
  a new patch version if it fails.
- Record Surface evidence in the issue or release notes: command, extension
  version, case name, PASS/FAIL, post URL when applicable, and any tag/media
  verification details.

See `docs/surface-cws-release-flow.md` for the exact staging, scheduled-task,
CDP tunnel, matrix, and cleanup workflow.
