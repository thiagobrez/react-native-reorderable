# Proposed agent-device synthesized-input preparation

[Upstream PR #2362](https://github.com/callstack/agent-device/pull/2362) is a proposed fix, not a shipped or confirmed fix. [CI restoration PR #101](https://github.com/thiagobrez/react-native-reorderable/pull/101) restores Agent Device for the five iOS 26 pointer scenarios while preserving the exact-candidate gate, existing whole-job retry, render backstop, parity checks and Pods cache fix.

## Current implementation

At upstream `211f232ee85df5742e3be093a008b46f80a6e1a7`, the shared iOS synthesized-event constructor attempts one empty event record before constructing the first real input record. Preparation adds no pointer paths or app-delivering contact, uses the already-resolved orientation and process ID, and adds no accessibility, screenshot or frame lookup. Only successful preparation sets the process-wide flag; a failure does not suppress the real action and allows a later attempt.

The maintainer requested this shared, contact-free boundary in place of the original gesture-only warm-up tap. The native regression exercises the actual bridge across gesture, scroll, drag, tap, swipe and sequence entry points. It observes an initial preparation failure, a later successful preparation and no further empty records. The real event record is created after preparation so its timestamps are fresh.

## What the evidence establishes

- The native ordering regression fails without the change and passes with it. This establishes ordering and retry semantics, not a cure for missing input.
- Local runs of the same Objective-C implementation passed three cold boots, nine gestures and three selector presses. A subsequent one-boot check of the corrected measurement harness also passed.
- [Hosted XCTest nightly](https://github.com/callstack/agent-device/actions/runs/34060558728) passes at `211f232ee`, including the isolated regression and the source-derived full-suite count of 226. [iOS smoke](https://github.com/callstack/agent-device/actions/runs/34058548288/attempts/2) and [CI/coverage](https://github.com/callstack/agent-device/actions/runs/34058548253) pass at that SHA.
- All downstream device, consumer, runtime and parity gates passed in [34056536337](https://github.com/thiagobrez/react-native-reorderable/actions/runs/34056536337), using `1cf7e5f1cfa7ff96ac5dd781b8af90fc6037457e` (identical Objective-C implementation). iOS 26 used its existing whole-job retry after an initial scenario-readiness failure. The workflow's optional final npm dry-run failed because version 1.0.0 was already published; the entire run is therefore not green.
- The later complete matrix [34060592647](https://github.com/thiagobrez/react-native-reorderable/actions/runs/34060592647) at `211f232ee` failed: iOS 27 fallback/native and Android passed, but both iOS 26 preparation attempts hit five-second Xcode toolchain-query timeouts. No iOS 26 gestures were measured in that run. Parity therefore could not pass.

Comparable hosted cold-start evidence and maintainer approval remain required. The fresh same-harness [base](https://github.com/thiagobrez/react-native-reorderable/actions/runs/34060459388) and [candidate](https://github.com/thiagobrez/react-native-reorderable/actions/runs/34060458003) both failed validation. Base first gestures were lost/error/prompt; candidate first gestures were error/error/prompt. The candidate also had an unobserved post-relaunch outcome after successful preparation. These are not a usable green comparison. [Detailed results](https://github.com/callstack/agent-device/pull/2362#issuecomment-5562425331) retain the setup and observation limitations.

## Withdrawn claims

In the candidate's unobserved post-relaunch gesture, UIKit logged touch dispatches after an initial delay of about 2.3 seconds from virtual-digitizer attachment. Passing sampled gestures reached initial app dispatch in roughly 10–33 ms. This contradicts complete non-delivery in that sample and suggests delayed/coalesced delivery may disrupt gesture recognition; touch-phase evidence is still needed. See the [native dispatch comparison](https://github.com/callstack/agent-device/pull/2362#issuecomment-5562449851).

The original persistent-digitizer explanation is contradicted by traces: digitizers attach and detach per real gesture, and empty preparation does not attach one. Preparation may affect other XCTest state, but that mechanism remains unproven.

The later `press id="engine-fallback"` probe uses private synthesis in both release 0.20.10 and the candidate (`fallbackAttempted=false`). It is not an independent public-XCTest control. A later successful input also cannot exclude an earlier simulator stall.

Post-command observation waits are not physical touch-delivery latency. A viewport or runner error cannot establish a missing app outcome. Video presentation timestamps must not be aligned with command wall time without an independently verified synchronization point.

See the [current measurement rules](./reproduction.md#measurement-limits-and-current-validation), [trace correction](https://github.com/callstack/agent-device/pull/2362#issuecomment-5561886720), and [historical proposal](https://github.com/thiagobrez/react-native-reorderable/blob/afdde2e0867beae448ec9784a641bbdd6cbdbde4/docs/handoffs/agent-device-upstream-reports/fix-proposal.md). The historical contact-based proposal and causal claims are superseded.

## Independent Android smoke blocker

Upstream Android smoke failed before input because a fixed scroll moved the press canary above the viewport. [PR #2369](https://github.com/callstack/agent-device/pull/2369) isolates a bounded visibility-based test-positioning correction. It changes no runtime code; [hosted Android smoke](https://github.com/callstack/agent-device/actions/runs/34061497846) and all other checks pass at `6211bfc3f15789fbb8cf5fd5907d399a7dd58d54`. The maintainer approved and merged it on September 6, 2026.

## iOS 26 versus iOS 27

The closest control is iOS 27 **fallback**: it explicitly selects the same engine that iOS 26 selects automatically, with the same app, scenarios, semantic gesture plans and Agent Device revision. The environment combinations differ: iOS 26.5 uses `macos-26` with Xcode 26; iOS 27.0 uses `xcode-27` with Xcode 27. The completed jobs also report different host macOS versions. This is an observed reliability difference between those environments, not proof that the simulator OS alone causes it.

The subsequent [touch-phase diagnostic run](https://github.com/thiagobrez/react-native-reorderable/actions/runs/34062782494) measured no gestures: two preparation errors and an app setup timeout. Its observation-only green status is not fix validation.
