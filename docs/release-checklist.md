# Tutti Beta exit / Release checklist

Conditions Tutti needs to satisfy before dropping the `Beta` badge and
recommending to the broader audience. Track here, not in scattered TODOs.

## Posting reliability

- [ ] All 11 SNS confirmed to post **text + image** in dummy account end-to-end
  - [x] X — reply chain verified (v0.4.67)
  - [x] Bluesky — reply chain verified via API (v0.4.68)
  - [x] Threads — single chunk verified
  - [x] Mastodon — verified
  - [x] Misskey — verified
  - [x] Tumblr — tags verified (v0.4.73)
  - [x] Pixiv — real post verified (v0.4.17)
  - [x] TikTok — verified (v0.4.25)
  - [x] YouTube Shorts — verified (v0.4.25)
  - [x] Instagram — caption injection verified (v0.4.69)
  - [x] DeviantArt — description + tags verified (v0.4.74)
- [ ] **At least 1 week of dogfooding** from the maintainer's real account
  with no regressions filed
- [ ] auto-triage pipeline has processed ≥ 3 selector breakage reports
  end-to-end without manual escalation

## Verify path

- [x] post-verify framework lands (v0.4.75)
- [x] og:meta verify for all 11 SNS (v0.4.76)
- [x] DOM verify fallback for login-wall SNS (v0.4.77)
- [x] auto-open on issue (v0.4.77)
- [ ] verify false-positive rate < 5% in dogfooding (track via `lastResults`
  warnings; if > 5% of warnings are spurious, tune `fuzzyContainsText`)

## Privacy & safety

- [x] No third-party server traversal of post content
  ([[framing_pain_relief]])
- [x] Bug-report path PII-redacted ([[report_path_pii_leakage]])
- [x] Diagnose payload limited to compose-context tabs
  ([[privacy_url_leak_incident_2026_05_08]])
- [x] PRIVACY.md lists CF Workers relay as the only exception
  ([[cf_workers_relay_for_reports]])
- [ ] Privacy policy reviewed against latest behavior set (auto-open,
  XHR hook for IG caption, localStorage borrow for Bluesky session)

## CWS

- [x] v0.4.64 Unlisted publish accepted
  ([[cws_submit_when_stable]])
- [ ] Listing description avoids SNS-name enumeration ([[cws_keyword_spam_zero_tolerance]])
- [ ] Screenshots regenerated for current popup state if material changed
- [ ] `contact@komm64.com` Cloudflare relay still routes
  ([[komm64_publisher_email]])
- [ ] Public submission once dogfood criteria above are met

## Documentation

- [x] README in English (`README.md`) + JP (`README.ja.md`)
- [x] Support page (`tutti-site/support.html`)
- [x] Privacy page (`tutti-site/privacy.html`)
- [x] `docs/platform-matrix.md` reflects current SNS status / limits
- [x] CHANGELOG.md covers v0.4.x bump history
- [ ] User-visible feature list in store listing matches reality (post-verify,
  auto-open, reply chains, hashtag tags)

## Tooling

- [ ] DOM smoke E2E (Surface self-hosted runner) registered as a GH Actions
  runner so auto-triage PRs can be gated
- [ ] API E2E secrets (Bluesky / Mastodon / Misskey) set in repo so nightly
  posts can verify the API path doesn't regress
- [x] `scripts/e2e/E2E-SETUP.md` documents the dual-runner setup

## Code hygiene

- [ ] All `auto-reported` issues resolved on tutti-issues at time of release
  (auto-triage pipeline + manual triage)
- [ ] `tsc --noEmit` clean (strict + `noUncheckedIndexedAccess`)
- [ ] `npm test` 150+ tests all pass
- [ ] No `// TODO` or `// FIXME` in shipped code without an issue link

## Exit criteria summary

Beta exit is gated on three things:
1. **Reliability**: 7-day clean dogfood, post-verify false-positive rate < 5%
2. **CWS**: public publish (or explicit `Unlisted` decision communicated)
3. **Docs**: store listing + privacy + support page match shipped behavior

When all checkboxes above are green, file an issue titled
`Drop Beta badge / cut v0.5.0` and tag the appropriate release.
