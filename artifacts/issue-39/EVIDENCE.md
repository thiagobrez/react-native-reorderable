# Issue 39 evidence ledger

This directory retains the focused, canonical evidence for the portable device
contract. Raw Detox logs, Agent Device daemon state, request traces, and
superseded exploratory attempts are CI artifacts and are intentionally not
committed.

## Harness capability

The repository pins Agent Device 0.20.10, which provides the published
selector-targeted continuous drag used here:

`gesture drag <source> <destination> [sourceHoldMs] [moveMs] [destinationHoldMs]`

The replay keeps one pointer down through source hold, movement, destination
hold, and release. iOS recordings use `simctl` outside the replay so evidence
capture does not contend with replay's device execution lock.
`e2e/contracts/pointer-drivers.json` selects Agent Device for
the pointer routes it supports and Detox for the remaining semantic and
lifecycle routes. All routes verify accessibility-visible labels and use exact
public test IDs to disambiguate gesture targets,
open a named Scenario Lab deep link, record deterministically, and run headless.

## Four-configuration matrix

The shared catalog is `e2e/contracts/scenarios.json`; the same definitions drive
these configurations:

- iOS 27 native (`engine=auto`): 13/13 passed
- iOS 27 forced fallback: 13/13 passed
- iOS 26 automatic fallback (`engine=auto`): 13/13 passed
- Android fallback: 14/14 passed

The four final per-case tables are under `device-tables/`. Canonical public
outcomes are under `outcomes/final-canonical/`. The parity comparator accepted
all applicable shared outcomes: event, callback count, visible order,
selection, cancellation, accessible reorder, and accessible drop.

The catalog covers free-form, virtualized list, section list, multi-selection,
scoped drag-and-drop, invalid/outside release, gesture/system interruption,
iOS inactive/background, Android app-state/blur/Back, disabling, unmount,
accessible reorder, and accessible drop. Contract tests contain no skip,
quarantine, per-test retry, or silent retry. The job runner permits one retry
only when the isolated runner identifies an infrastructure failure, records
both attempts, and publishes only a successful attempt.

## Continuous destination feedback

`feedback-report-final.json` contains the analyzer output for all 20 unique
pointer runs: five pointer scenarios on each configuration. Each run has three
samples captured during the uninterrupted destination hold. The verifier
requires a unique visible source and destination relation, or a measured public
destination visual change where the source occludes the insertion band. It
does not require pixel-identical rendering.

Verification command:

```sh
node scripts/verify-device-feedback.mjs artifacts/issue-39/feedback-report-final.json
```

Expected result: `Verified continuous feedback for 20 runs`.

## Physical iOS 27 VoiceOver

The accepted physical record is
`physical-ios27-voiceover/2026-08-14T180600Z-00008150/RECORD.md`.
On an iPhone 17 Pro Max running iOS 27.0, the recorded Agent Device client drove
VoiceOver custom actions and captured uninterrupted recordings,
screenshots, accessibility snapshots, gesture telemetry, device/build metadata,
and Caption Panel transcripts.

The run proved both exact announcements and retained logical focus:

- “Moved 2 items to position 2 of 3.” with order `yellow, blue, green`, the
  canonical two-item reorder event, and callback count one.
- “Dropped 2 items.” with the canonical accepting-zone event and callback
  count one.

`PHYSICAL-IOS27-VOICEOVER.md` remains the reusable, unexecuted protocol; the
timestamped record is the accepted run.

## Source gates

The final source tree passed:

- `yarn prepare`
- `yarn test --runInBand` (25 suites, 278 tests)
- `yarn lint`
- `yarn typecheck`
- `git diff --check`

The physical record identifies the installed signed app and the exact runtime
source digest used for its final verification. CI-generated recordings and raw
logs remain available from the corresponding workflow artifact rather than
inflating repository history.
