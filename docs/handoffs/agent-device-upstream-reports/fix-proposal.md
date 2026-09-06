# Fix proposal for agent-device: readiness preflight proves the wrong channel

Grounded in the upstream `main` source at `callstack/agent-device` (read 2026-09-06)
and the CI reproduction on this branch. This is a design writeup, not a merged
patch: the change touches the device-gated Apple runner path and needs live
simulator iteration plus upstream's gate suite before it is PR-ready.

## Mechanism (what the reproduction and upstream evidence agree on)

The XCUITest runner runs a **readiness preflight** before a touch mutation when the
session has `no_recent_healthy_mutation` — i.e. the first gesture after a cold boot
or a fresh runner session (`packages/platform-apple/src/runner/runner-session.ts`,
`resolveRunnerReadinessPreflightDecision`). The preflight dispatches a **read-only**
command: in the captured logs it is `gestureViewport`, a `readOnlyReadinessProbe`
trait (`runner-command-traits.ts`). A read-only accessibility query proves the AX
channel answers; it does **not** exercise the synthesized-touch delivery path.

On a cold or loaded simulator the AX channel warms up before the HID/synthesized-event
pipeline, so the preflight passes while the first real `gesture` is still delivered
seconds late. And `gesture` reports `ok` from `synthesizeWithError` returning `true`
(`RunnerSynthesizedGesture.m`), which only proves the event record was **posted** to
the synthesizer, not that the app received the touch. So a late or dropped first touch
is reported as a successful gesture with the exact scripted duration.

This is the same shape upstream already fixed for **text entry**: `type` used to report
`ok` while trailing characters were uncommitted; #1924/#2035 made it observe the commit
(progress-aware, `RunnerTests+SynthesizedCommitDeadline.swift`) and report
`TEXT_INPUT_COMMIT_NOT_OBSERVED` when it cannot. The gesture path has no equivalent
delivery observation. #1563 ("distrust post-gesture stability that matches the
pre-gesture baseline") is the nearest existing building block.

It is general: any first synthesized drag/tap/swipe into a freshly booted simulator is
exposed, not anything specific to one app.

## Reproduction evidence (this branch)

`.github/workflows/repro-cold-simulator-touch.yml`, run 34025552105, macos-26 / iOS 26.5,
4 samples x 3 iterations. Of the 7 iterations that reached the gesture, the first
synthesized drag was lost or late in 3 while the gesture command reported `ok`; delivery
latency across all 21 measured gestures ran min 179 ms, median 1100 ms, p90 15465 ms, max
40918 ms (the p90 is a full 15 s wait timeout). In the two clean lost cases the gesture
reported `ok` with `durationMs` 9850 and the app never observed the drop.

**Discriminator:** in every lost or late iteration the public XCTest coordinate tap on the
same runner, moments later, landed in under a second. The loss is specific to the private
synthesized-event path, not a simulator-wide input stall. That narrows the fix to the
synthesized-gesture path and rules out boot/AX-readiness as the whole story.

## Two candidate fixes, both general and in-repo style

### A. Observe gesture delivery (preferred; mirrors the text-entry fix)

Make a synthesized gesture's success contingent on *observing* that the contact reached
the app within a progress-aware deadline, rather than trusting `synthesizeWithError`.
Reuse the #1563 pre/post baseline: after synthesis, confirm the tree changed from the
pre-gesture baseline (or the target's own state advanced) before returning `ok`; on no
change within an absolute ceiling, return a typed `GESTURE_NOT_OBSERVED` with the same
progress-vs-wedge distinction `SynthesizedCommitDeadline` already encodes.

- Pro: fixes the misreport itself; needs no per-app knowledge; matches #2035 philosophy.
- Con: a drag has no universal "expected outcome," so the observable is "something moved,"
  which must be tuned to avoid condemning legitimately no-op gestures. Needs the
  device loop to calibrate the ceiling and the change signal.

### B. Warm the touch channel in the preflight (narrower)

When a touch mutation would run under `no_recent_healthy_mutation`, have the readiness
preflight exercise the **synthesized-touch** path (a bounded, neutral zero-distance
synthesized contact) instead of a read-only AX probe, so the cold input pipeline is
confirmed before the contract gesture. Keep it progress-bounded, not a fixed sleep.

- Pro: smallest change to the reporting contract; localized to the preflight seam.
- Con: injects a synthetic touch; must pick a provably safe location and prove it is a
  no-op for the app. Upstream's #1874 writeup is skeptical of warm-ups that only prove a
  helper ran, so this needs to demonstrably reduce the measured latency tail, not just
  add a step.

## What a PR needs before it is credible

1. Live simulator iteration to choose the observable/ceiling (A) or the safe neutral
   contact (B), on a hosted-class runner where the tail actually appears.
2. Regression evidence in upstream's required form: the XCTest that fails without the
   change and passes with it (`docs/agents/testing.md`), plus the negative case proving
   the typed reason (not message text) is what gates behavior.
3. Their gate suite: `pnpm check:affected --run`, `pnpm check:xctest-selection`, the
   affected Apple runner build, and a device run of the changed path
   (`docs/agents/device-verification.md`).
4. An upstream issue first (there is none for this — searched 2026-09-06), linking the
   lost-touch report from our issue #84 and this reproduction.

## Files a fix would touch

- `apple/runner/AgentDeviceRunner/AgentDeviceRunnerUITests/RunnerTests+CommandExecution.swift` (drag execution / response), option A.
- `apple/runner/.../RunnerTests+SynthesizedGesturePolicy.swift` or a new deadline module mirroring `RunnerTests+SynthesizedCommitDeadline.swift`, option A.
- `packages/platform-apple/src/runner/runner-session.ts` + `runner-command-traits.ts` (preflight command choice), option B.
