# Platform support matrix

This document is the **single source of truth for real-post verification
state** across the 11 networks Tutti supports. Executable content-kind and
media constraints use `src/adapters/<id>.ts` as their source of truth; tests
keep the corresponding tables below aligned with those adapters.

Look here to know what the adapters support and what has not yet been verified
with a real post.

> Update rule: change executable support or constraints in the adapter first
> and update the reflected table in the same change. Update real-post
> verification state in this document first. README / CWS listing etc.
> reference this.

## Legend

- ✅: supported and verified
- ⚠️: implementation exists, but autoPost-ON real-post verification is shallow (preview/dry-run only)
- —: unsupported (kind not in adapter / blocked by constraints)
- **DOM**: drive the SNS web compose page via DOM manipulation (Playwright-style)
- **API**: call the SNS's official API directly (only active when credentials are registered)
- **multi-step**: for multi-modal wizard UIs (P12 framework `executeMultiStepFlow`)
- **foreground tab**: needs `active: true` tab to drive a heavy SPA
  (`requiresForegroundTab: true`)

## Overall matrix

| network | text | image | shortVideo | longVideo | path | multi-step | fg tab | API |
|---|:---:|:---:|:---:|:---:|---|:---:|:---:|:---:|
| X | ✅ | ✅ | ✅ | ✅ | DOM | — | — | — |
| Bluesky | ✅ | ✅ | ✅ | ✅ | DOM + API | — | — | ✅ |
| Threads | ✅ | ✅ | ✅ | ✅ | DOM | — | — | — |
| Mastodon | ✅ | ✅ | ✅ | ✅ | DOM + API | — | — | ✅ |
| Misskey | ✅ | ✅ | ✅ | ✅ | DOM + API | — | — | ✅ |
| Tumblr | ✅ | ✅ | ✅ | ✅ | DOM | — | — | — |
| Pixiv | — | ✅ | — | — | DOM | ✅ | ✅ | — |
| TikTok | — | — | ✅ | — | DOM | ✅ | ✅ | — |
| YouTube (Shorts) | — | — | ✅ | — | DOM | ✅ | ✅ | — |
| Instagram | — | ⚠️ | ⚠️ | — | DOM | ✅ | ✅ | — |
| DeviantArt | — | ⚠️ | — | — | DOM | ✅ | ✅ | — |

## Posting constraints (extracted from adapter code, as of 2026-07-27)

| network | charLimit | maxImages | maxBytesPerImage | maxBytes (video) | maxDurationS |
|---|---:|---:|---:|---:|---:|
| X | 280 | 4 | 5 MiB | 512 MiB | 140 |
| Bluesky | 300 | 4 | 2,000,000 bytes | 80 MiB | 180 |
| Threads | 500 | 10 | 8 MiB | 1 GiB | 300 |
| Mastodon (mastodon.social) | 500 | 4 | 8 MiB | 40 MiB | unlimited |
| Misskey (misskey.io) | 3000 | 16 | 100 MiB | 100 MiB | unlimited |
| Tumblr | 4096 | 10 | 10 MiB | 100 MiB | unlimited |
| Pixiv | 1000 (caption) | 200 | 32 MiB | — | — |
| TikTok | 2200 (caption) | — | — | 287 MiB | 180 |
| YouTube (Shorts) | 5000 (description) | — | — | 2 GiB | 60 |
| Instagram | 2200 (caption) | 10 | 30 MiB | 100 MiB | 60 |
| DeviantArt | 5000 | 1 | 30 MiB | — | — |

- "unlimited" means **the client does not check duration**. The SNS may
  still reject server-side (the SNS UI error is surfaced to the popup).
- Mastodon / Misskey are federated, so per-instance constraints vary.
  Switching the instance URL in Settings is expected to switch the values
  alongside.
- Bluesky's `maxBytes` is a **conservative 80 MiB** value with SI margin.
  Overridden by the actual value from the API probe (P17) when available.
- Video `maxBytes` overflow triggers **automatic compression** via the
  offscreen ffmpeg.wasm path (P16).

## Verification state (autoPost real posting)

| network | preview (dry-run) | autoPost real | last verified | notes |
|---|:---:|:---:|---|---|
| X | ✅ | ✅ | v0.3.8 | inline compose path (P11) |
| Bluesky | ✅ | ✅ | v0.4.x (P11) | DOM + API both |
| Threads | ✅ | ✅ | v0.4.x (P11) | aria-label fallback |
| Mastodon | ✅ | ✅ | v0.4.x (P11) | with confirmDialog alt-text auto-approval |
| Misskey | ✅ | ✅ | v0.4.x (P11) | drop mode |
| Tumblr | ✅ | ✅ | v0.4.x (P11) | components-drop-zone |
| Pixiv | ✅ | ✅ | v0.4.17 | required tags + hidden radio (P12-A.1–.4) |
| TikTok | ✅ | ✅ | v0.4.18 / v0.4.26 | Draft.js clearing fix |
| YouTube (Shorts) | ✅ | ✅ | v0.4.25 | div#textbox×2 disambig, Made for Kids required |
| Instagram | ✅ | ⚠️ pending | — | 4-step modal wizard complete, real post not yet verified |
| DeviantArt | ✅ | ⚠️ pending | — | upload modal complete, real post not yet verified |

## E2E coverage (`scripts/e2e/platforms/`)

Real-posting E2E smoke tests assume a self-hosted runner (anti-bot
detection blocks GitHub-hosted). Current covered/uncovered:

| network | E2E module exists | runner | comment |
|---|:---:|---|---|
| X | ✅ | self-hosted | `x.mjs` done; delete step not implemented |
| Bluesky | — | API candidate | API path available; can run on GitHub-hosted |
| Mastodon | — | API candidate | same |
| Misskey | — | API candidate | same |
| remaining 7 | — | self-hosted | DOM-only, requires self-hosted |

Plans:
- API path (Bluesky / Mastodon / Misskey): a separate workflow that posts
  then deletes via credentials on GitHub-hosted nightly.
- DOM-only networks: set up a self-hosted runner per
  `scripts/e2e/E2E-SETUP.md` and run on selector-PR / nightly.

## Selector hot-fix delivery

Every DOM-driven network honors **the public `selectors.json` override feed**:

1. SNS UI changes and selectors stop matching.
2. User sends a diagnostics-attached issue via the popup's Report button.
3. `auto-triage.yml` in the private `komm64/tutti-issues` repo classifies the
   redacted report deterministically. It does not invoke Codex, create a public
   PR, or update the feed.
4. A maintainer patches public `src/adapters/<network>.ts`; when a remote
   hot-fix is needed, the maintainer separately updates private
   `komm64/tutti-site/selectors.json` and validates it with
   `npm run selectors:validate -- ..\tutti-site\selectors.json`.
5. Human review → merge → public site publish.
6. Reaches every user whose `Settings.selectorOverrideUrl` is enabled,
   within minutes.

Details: `docs/ci-setup.md`.

## Known instabilities / caveats

- **Pixiv**: `R-18 / AI=Yes` toggles are hardcoded (general / notAiGenerated).
  Exposing them via Options is still on the list for adult / AI artists.
- **YouTube**: `visibility=Public` is set automatically since v0.4.25.
  Google accounts without a created channel can't reach the upload page,
  so user guidance is needed.
- **Instagram**: The 4-stage modal flow walks through Crop/Edit as no-ops.
  Users wanting filters need a separate flow added later.
- **Tumblr**: Must aim for `.components-drop-zone`; dropping on a
  textarea triggers the block-type selector menu instead.
- **TikTok**: Draft.js requires execCommand-based clearing for existing
  text (memory `contenteditable_clearing_strategies.md`).
- **Threads**: Meta / React Native Web base. `aria-label` DOM changes
  relatively often → selectors.json hot-fix is well-suited here.

## Related files

- 各 adapter: `src/adapters/<id>.ts`
- registry: `src/adapters/registry.ts`
- API クライアント: `src/api/{bluesky,mastodon,misskey}.ts`
- multi-step framework: `src/utils/step-runner.ts`
- selector hot-fix: `src/utils/selector-overrides.ts` + `tutti-site/selectors.json`
- E2E runner: `scripts/e2e/run.mjs`, `scripts/e2e/E2E-SETUP.md`
