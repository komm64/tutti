# Production compatibility switch decisions

Issue #12 Phase 6 requires an independent decision for each high-risk Phase 7
and Phase 8 migration. A production legacy path is allowed when the deployed
implementation can remain complete, isolated behind a stable boundary,
user-selectable before side effects, and explicitly time-bounded. The decision
baseline is extension `0.5.49`.

## Decision matrix

| Criterion | Page injection | Post orchestrator |
|---|---|---|
| Complete deployed recovery path | Not met. The old platform-specific hook set cannot coexist safely with the tagged singleton observer. | Met. The published v0.5.49 controller is retained as a complete implementation rather than reconstructing selected behaviors. |
| Bounded legacy/next difference with supportable maintenance cost | Not met. Retention duplicates page-world interception and creates hook-order interactions with the single-observer design. | Met for the migration window. One frozen background controller is kept behind the `PostingAlgorithmOrchestrator` boundary; request safety remains shared outside it. |
| Options support control without raw storage editing | Not present. Adding UI and storage only to expose an unsafe hook combination is not justified. | Met. The collapsed experimental Options section selects `next` or `legacy` for the next request. |
| Owner, introduction version, and removal version | Not supplied because the path is rejected. | Met: Issue #152, introduced 0.5.50, removal before 0.5.52. |
| No added permission or remote-code constraint | Not met for review and runtime hook ownership. | Met. The fallback is bundled background TypeScript and adds no permission, remote code, or simultaneous dispatch. The temporary bundle cost is accepted. |

Decisions:

- `page-injection`: **no production legacy switch**
- `post-orchestrator`: **time-bounded production legacy switch**

The decisions are independent. Retaining the old posting controller does not
install or select an old page-world hook implementation.

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
- The production bundle contains the decomposed `NextPostingOrchestrator` and a
  frozen, complete v0.5.49 `LegacyPostingOrchestrator`.
- `SubmissionGuard`, request fingerprinting, history ownership, and scheduling
  remain outside both implementations and protect both paths.
- The selected implementation is fixed before platform execution; one request,
  retry, and thread chain remains on that implementation.
- There is no automatic fallback after DOM or API dispatch.
- The default is `next`. The hidden support control affects only the next new
  request.
- The upload candidate must pass both implementations on the exact artifact,
  including affected real posting, URL capture, and verification cases.

## Guard

`PRODUCTION_COMPATIBILITY_SWITCHES` registers
`legacy-post-orchestrator` through 0.5.51. It defaults to `next`, is owned by
Issue #152, and must be removed before 0.5.52.

`architecture:check` fails invalid metadata, duplicate active scopes, or
entries whose removal version has been reached.

## v0.5.50 posting algorithm preference

An early Issue #12 draft proposed install buckets and a percentage rollout.
That proposal was withdrawn during design review and was never implemented or
shipped.

Issue #152 adds a request-scoped `postingAlgorithm` support preference in the
collapsed experimental Options section. The selection happens at the root
platform-poster boundary: all platforms in the request are routed through the
complete `NextPostingOrchestrator` or `LegacyPostingOrchestrator`.

- The default is deterministically `next`; there is no random bucket or
  percentage rollout.
- The selected `next | legacy` value is read once before a new request reserves
  its platforms and is fixed for the request, retry, and thread chain.
- The selector is not an X-specific branch. Each path owns its complete
  posting, retry, URL-capture, and verification controller.
- The intended user-visible improvement in `next` is X long-text posting: it
  builds the complete compose thread and submits once with **Post all**, while
  `legacy` posts sequentially and replies to each captured post URL.
- Diagnostics record the selected profile for every platform result in that
  request.
