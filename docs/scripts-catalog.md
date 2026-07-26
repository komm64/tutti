# Scripts catalog

Phase 0 of issue #12 classifies every tracked `.mjs` file in
[`scripts/catalog.json`](../scripts/catalog.json). The catalog is the only
classification source of truth; scripts do not carry duplicate classification
headers.

## Classification contract

| Class | Contract |
| --- | --- |
| `probe` | Exploratory or transient investigation. Keep until human review. |
| `supported-cli` | Maintained developer/release command, or a module loaded by one. |
| `release-gate` | Evidence-producing command required by a documented release flow. |
| `e2e` | Repeatable browser or end-to-end behavior check. |
| `diagnostic` | Manual inspection, capture, cleanup, or troubleshooting command. |
| `obsolete-candidate` | Possible Phase 9 cleanup target; never delete from reachability alone. |

Dynamic modules under `scripts/e2e/platforms/` and manual CWS tools under
`scripts/cws/` are deliberately protected as `supported-cli`.

## Commands

```powershell
npm run scripts:check
npm run scripts:list
npm run scripts:list -- probe
npm run scripts:inventory
```

`scripts:check` fails for an unregistered tracked or unignored `.mjs` file, a
missing catalog target, duplicate path, invalid class, malformed entry, or
unsorted catalog. CI and `npm run verify:commit` both run it.

`scripts:inventory` regenerates
[`generated/scripts-inventory.md`](generated/scripts-inventory.md) for human
review. The report combines the catalog with:

- package, documentation, workflow, and Surface/CWS runbook references;
- literal static/dynamic imports and non-literal dynamic import patterns;
- in-file usage comments;
- the last tracked Git change.

These signals help form cleanup candidates. They are not deletion criteria.
