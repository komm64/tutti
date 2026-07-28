# Production compatibility switch decisions

Issue #12 Phase 6 requires an independent decision for each high-risk Phase 7
and Phase 8 migration. A production legacy path is allowed only when every
criterion below is satisfied. The decision baseline is extension `0.5.49`.

## Decision matrix

| Criterion | Page injection | Post orchestrator |
|---|---|---|
| Environment-dependent failure with demonstrated user recovery | Not demonstrated. The current five platform-specific fetch/XHR wrapper pairs are not known to recover a failure of the planned tagged singleton observer. | Not demonstrated. The migration decomposes the same orchestration behavior; no environment is known where selecting the monolith recovers a next-path failure. |
| Bounded legacy/next difference with supportable maintenance cost | Not met. Retention duplicates page-world interception and creates hook-order interactions with the single-observer design. | Not met. Retention duplicates the posting side-effect controller, including service-worker lifetime, tab/account state, retry, thread, and concurrency behavior. |
| Options support control without raw storage editing | Not present. Adding UI and storage only to expose an unproven recovery path is not justified. | Not present for the same reason. |
| Owner, introduction version, and removal version | Could be supplied, but metadata alone does not offset the failed criteria. | Could be supplied, but metadata alone does not offset the failed criteria. |
| No added bundle, permission, or CWS constraint | Not met for bundle and review surface: production would carry both interception implementations. | Not met for bundle and review surface: production would carry both orchestration implementations. |

Decisions:

- `page-injection`: **no production legacy switch**
- `post-orchestrator`: **no production legacy switch**

Both decisions are independent; each fails multiple required criteria. A future
change may revisit one scope without changing the other, but it must cite new
field evidence and amend this decision before registering a switch.

## Phase 7 contract

- The compatibility path is fixed before installing any page-world hook.
- Legacy comparison code may exist only behind `import.meta.env.DEV` while the
  pilot is verified.
- The production bundle contains only the tagged singleton observer path.
- There is no automatic fallback and no simultaneous legacy/next hook install.
- The upload candidate must pass exact-artifact Surface preview and affected
  real-browser capture cases.

## Phase 8 contract

- Existing behavior is first fixed by characterization tests, then moved behind
  the new responsibility boundaries.
- Development-only comparison is allowed during migration, but one request,
  retry, and thread chain remains on one implementation.
- The production bundle contains only the decomposed next orchestrator.
- There is no automatic fallback after DOM or API dispatch.
- The upload candidate must pass exact-artifact Surface preview plus affected
  real posting, URL capture, and verification cases.

## Guard

`PRODUCTION_COMPATIBILITY_SWITCHES` is intentionally empty. Any future exception
must default to `next` and declare an owner issue, introduction version, and
removal version. `architecture:check` fails invalid metadata, duplicate active
scopes, or entries whose removal version has been reached.

## v0.5.50 posting algorithm preference

Issue #152 adds a durable, request-scoped `postingAlgorithm` preference in the
collapsed experimental Options section. This does not restore the removed
monolithic orchestrator or bundle two side-effect controllers, so it is not a
temporary production compatibility switch and is not registered above.

- The default is deterministically `next`; there is no random bucket or
  percentage rollout.
- The selected `next | legacy` value is read once before a new request reserves
  its platforms and is fixed for the request, retry, and thread chain.
- Both profiles share the decomposed orchestrator. The bounded behavioral
  difference is X long-text posting: `next` builds the complete compose thread
  and submits once with **Post all**, while `legacy` posts sequentially and
  replies to each captured post URL.
- Diagnostics record the selected profile for every platform result in that
  request. Platforms without a profile-specific behavior continue through the
  shared implementation.
