# Architecture guards

Run the focused architecture checkpoint with:

```powershell
npm run architecture:check
```

This command checks the scripts catalog, then runs the structural Vitest suite
for import cycles, selector contracts, adapter/strategy completeness, docs
alignment, platform literal policy, entrypoint import boundaries, background
message routing, message/storage facades, and UI localization.

`npm test` remains the authoritative full test suite. The focused command is a
fast local checkpoint and a named CI step; architecture tests must remain part
of the normal Vitest discovery as well.

## Temporary allowances

Prefer fixing a violation. If a migration genuinely requires a temporary
allowance, pass it to `assertArchitectureGuard` with:

- the exact violation fingerprint
- a concrete reason of at least 20 characters
- one owning issue in the form `Issue #123`
- an expiry date in `YYYY-MM-DD` form

The guard fails for invalid or expired metadata, unlisted violations, duplicate
allowances, and stale allowances whose violation has disappeared. Stale entries
must be removed in the same change that removes the violation.

There are currently no temporary allowances in the repository architecture
guards.
