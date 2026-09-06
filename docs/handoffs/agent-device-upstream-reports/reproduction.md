# Reproduction: first synthesized drag lost on a cold hosted iOS 26.5 simulator

> Proposed fix: [callstack/agent-device#2362](https://github.com/callstack/agent-device/pull/2362). The historical runs demonstrate missing or delayed **app outcomes**, not a proven transport-level cause. The persistent-digitizer explanation was contradicted by later traces; see [the reassessment](./fix-proposal.md).

Workflow: `.github/workflows/repro-cold-simulator-touch.yml`
Driver: `scripts/repro-cold-simulator-touch.mjs`

## What one iteration does

1. `xcrun simctl shutdown` → `erase` → `boot` → `bootstatus -b` on the iPhone 17 Pro
   simulator of the requested runtime, then `simctl install` of the Release
   Scenario Lab build (same xcodebuild invocation as the device-contract job).
2. `agent-device daemon stop`, then `agent-device prepare ios-runner` with a
   per-iteration `AGENT_DEVICE_STATE_DIR`.
3. The device-contract preflight dance: `open --relaunch`, wait for
   `Scenario Lab`, open the free-form deep link, `alert accept`, relaunch, deep
   link again, wait for the initial order and `Callback count: 0`.
4. Start a `simctl io recordVideo` capture.
5. **First gesture**: `gesture drag 'id="card-card-0"' 'id="card-card-3"' 650 1200 8000 --json`,
   then `wait "Callback count: 1" 15000`. `delivered=false` with `gestureExit=0`
   is the reproduced defect.
6. Probes, always run so passing iterations act as controls:
   - **second gesture** on the same app instance (private event synthesis again;
     it drags the last card to the top so it changes the order whatever the first
     drag did);
   - **relaunch gesture**: `open --relaunch` + deep link, then the same drag;
   - **selector press**: `press 'id="engine-fallback"'` then `wait text 'engine=fallback'`.
     This can use the same private synthesis bridge as the drag; it is not an
     independent public-XCTest control.
7. Collect `simulator-log.txt` (backboardd, SpringBoard, app), `host-log.txt`
   (testmanagerd, CoreSimulatorService), the recording, the agent-device state
   directory (runner.log, request logs) and `iteration.json`.

`summary.json` and the job step summary hold one row per iteration with
the gesture observation classes and `selectorTapDelivered` (historical artifacts
called the last field `xctestTapDelivered`).

## Measurement limits and current validation

`waitDurationMs` measures observation after the gesture command returns, not time
from touch-down to input delivery. Historical percentile tables below also included
errored commands; those waits cannot establish touch latency. Current summaries use
`postCommandObservationWaitMs` and exclude commands that failed before synthesis
or could not observe the result. A failed wait only counts as `lost` when its
structured reason is `wait_target_absent`; viewport errors, runner restarts and
other observer failures are `observation-error`, and still fail validation.
Both released 0.20.10 and candidate traces show the selector press using
`kind=coordinateTap` private synthesis with `fallbackAttempted=false`. The original
claim that this was an independent public-XCTest discriminator is withdrawn.
A later successful action also cannot rule out a simulator stall that recovered
before that action. A URL confirmation covering the app is a setup failure;
matching text behind it does not establish readiness.

The normal mode records observations. `--expect prompt` requires every cold
iteration and follow-up to pass; `--expect reproduced` requires a reproduced
symptom and rejects setup errors. Both workflows accept an optional immutable
`agent_device_sha`; local runs accept `AGENT_DEVICE_BIN`. Build the selected CLI
and runner before starting the loop, and keep those artifacts unchanged until
session cleanup completes.

## Results (run 34025552105, macos-26 / iOS 26.5, 4 samples x 3 iterations)

Seven iterations reached the gesture; the first synthesized drag was **lost or late in 3 of them** while the gesture command reported ok, and the delivery-latency distribution across all 21 measured gestures was min 179 ms, median 1100 ms, **p90 15465 ms, max 40918 ms** — the p90 is a full 15 s wait timeout.

| sample/it | first gesture | 1st wait | Selector press | note |
| --- | --- | --- | --- | --- |
| 2 / 2 | **lost** | 15.3 s (timeout) | delivered 851 ms | gesture reported ok, durationMs 9850; app never saw it |
| 2 / 3 | **lost** | 40.9 s | delivered 131 ms | delayed burst drained ~40 s late |
| 1 / 2 | **late** | 7.7 s | delivered | outcome observed 7.7 s after the gesture command returned |
| 4 / 1 | errored | 15.5 s (timeout) | delivered 240 ms | gesture command itself exited 1; app also lost |
| 1 / 1, 3 / 1, 3 / 2 | prompt | 0.3-2.7 s | delivered | healthy |

**Original interpretation withdrawn.** A subsequent selector press worked, but it
used the same private synthesis bridge. These outcomes cannot identify a private
versus public input-path failure or establish a persistent-digitizer mechanism.

## Hardened-run confirmation (run 34027523634, same matrix)

After adding the setup retry and the delivery classification, a second 4x3 run measured
**all 12 iterations** (0 wasted, was 5 of 12) and reproduced the defect independently:

- first gesture: 1 lost, 2 late, 3 errored, 6 prompt; delivery latency across 36 gestures
  median 888 ms, p90 15284 ms, max 16867 ms.
- the XCTest coordinate tap landed in 11 of 12 iterations, including every lost/late one;
  the single exception (sample 4 iteration 3) was an iteration where the whole input path
  stalled, not just the synthesized gesture.

Across both runs (24 iterations) the defect appears in a consistent fraction with a p90
delivery latency at the full wait timeout, so the matrix reliably surfaces it even though a
single iteration is probabilistic. "errored" iterations show the same ~15 s app-loss with a
non-zero gesture exit rather than a false ok; they are excluded from the conservative
reproduced count.

## Delivery classes

Each gesture is classified by what the app observed, not the gesture command's exit code:

- **lost** the gesture reported ok but the app never observed the effect (15 s wait timed out).
- **late** the app observed it, but only after 3 s (`LATE_DELIVERY_THRESHOLD_MS`).
- **prompt** the app observed it promptly (healthy).
- **errored** the gesture command itself failed (a different symptom, not counted as reproduced).

`summary.json` carries the per-iteration classes, the counts, and the latency distribution; the job step summary prints them.

## Reading the probes


| first | second | relaunch | Selector press | Reading |
| --- | --- | --- | --- | --- |
| lost | delivered | delivered | delivered | The first outcome was not observed; later gestures worked. Cause remains unproven. |
| lost | lost | delivered | delivered | Outcomes were observed after relaunch; this does not identify a transport cause. |
| lost | lost | lost | delivered | The later selector press worked after failed drag outcomes; both may use private synthesis. |
| lost | lost | lost | lost | No expected outcomes were observed; inspect setup, overlays, app, runner and simulator evidence. |

## Running it

```bash
gh workflow run repro-cold-simulator-touch.yml --ref docs/issue-84-agent-device-upstream-handoff -f iterations=3 -f samples=4
gh run list --workflow repro-cold-simulator-touch.yml --limit 5
gh run download <run-id> -D /tmp/repro
```

Locally (fast machines have never reproduced it, but the mechanics can be checked):

```bash
node scripts/repro-cold-simulator-touch.mjs --runtime iOS-26-5 --iterations 1 --out /tmp/repro-smoke
```

Without `--expect`, the driver records observations without enforcing a verdict.
Use `--expect prompt` or `--expect reproduced` for pass/fail validation.
