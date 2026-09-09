# Agent Device cold-simulator investigation (issue #84)

The active report is [callstack/agent-device#2362](https://github.com/callstack/agent-device/pull/2362). [Downstream PR #101](https://github.com/thiagobrez/react-native-reorderable/pull/101) restores Agent Device for the five iOS 26 pointer scenarios and allows validation against an immutable upstream source revision.

Read the [current proposal and evidence](./fix-proposal.md) and [reproduction rules](./reproduction.md) before reusing earlier claims. The original handoff overstated both the cause and the fix. Missing app outcomes are established in retained runs; a persistent digitizer-attachment defect and a successful warm-up cure are not.

## Current status

- The maintainer's structural and regression-test requests are implemented. The PR remains draft pending a controlled cold-start comparison showing improvement.
- iOS 27 fallback and native lanes passed the latest completed full matrix; iOS 26 failed before gestures during toolchain discovery. Earlier iOS 26 runs include both successful gestures and missing outcomes. See the [explicit environment comparison](https://github.com/callstack/agent-device/pull/2362#issuecomment-5581718543).
- The separate Android smoke-positioning correction [#2369](https://github.com/callstack/agent-device/pull/2369) passed its checks and was merged by the maintainer.
- The second proposed report (`dyld` / `libcurl`) was dropped as unconfirmed. Do not reopen it from the original handoff.

## Evidence and historical material

The [original report draft](./report-1-ios26-cold-simulator-lost-touch-stream.md) is historical material, not a current paste-ready report. Its transport explanation, public-XCTest control claim and video-derived latency estimates are superseded by the reassessment.

`stage-evidence.sh` retrieves the original recordings and logs from runs 33488489650 and 33355396042. Their original artifact expiry dates are September 15 and September 14, 2026. Retain downloaded copies before expiry. New reproduction runs retain their evidence for 30 days and are linked from the upstream PR.

Video frames establish visible outcomes. Similar recording and command durations do not establish clock synchronization: do not subtract a command wall timestamp from video presentation time to estimate physical touch latency.

Issue [#80](https://github.com/thiagobrez/react-native-reorderable/issues/80) tracks adopting a subsequent release. Maintainer approval and passing downstream validation are still required; this handoff does not authorize merging or releasing.
