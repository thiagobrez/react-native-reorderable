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
   then `wait "Callback count: 1" 15000 --json`. A successful gesture followed by
   a wait whose structured reason is `wait_target_absent` establishes that the
   expected outcome was not observed within that wait. Other observer errors do
   not establish a missing outcome.
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

## Historical results

The original [four-sample run](https://github.com/thiagobrez/react-native-reorderable/actions/runs/34025552105) and [setup-retry run](https://github.com/thiagobrez/react-native-reorderable/actions/runs/34027523634) reported missing or delayed first outcomes. Their classifier included observer failures as missing outcomes and their wait distributions included failed commands. Their original counts and percentile labels must not be used as current transport or timing evidence.

The earlier exact-source [base run](https://github.com/thiagobrez/react-native-reorderable/actions/runs/34056421445) observed two missing first outcomes and one delayed first observation. The [candidate run](https://github.com/thiagobrez/react-native-reorderable/actions/runs/34056673023) failed: it included toolchain/setup failures, an invalid viewport before synthesis, a URL confirmation overlay, and an observer error falsely classified as lost even though the recording showed a committed drop. It is not a green comparison.

Fresh base and candidate runs use the corrected harness at downstream `afdde2e0867beae448ec9784a641bbdd6cbdbde4`; see [current validation](./fix-proposal.md#what-the-evidence-establishes). Original reports remain in Git history and retained run artifacts.

## Delivery classes

Each class describes the command result and post-command observation:

- **lost**: the gesture command succeeded, but the expected effect was absent when the wait failed with `wait_target_absent`.
- **late**: the wait succeeded after more than 3 seconds (`LATE_DELIVERY_THRESHOLD_MS`).
- **prompt**: the wait succeeded within 3 seconds.
- **errored**: the gesture command failed; not counted as a measured missing outcome.
- **observation-error**: the wait failed without establishing target absence; not counted as a measured missing outcome.

`summary.json` carries the classes and post-command wait distribution. `--expect prompt` requires every gesture and follow-up to pass promptly, every selector press to be observed, and no setup errors. `--expect reproduced` requires at least one lost or late first observation and a usable first-gesture measurement on every iteration. Neither expectation proves a transport mechanism.

## Reading the probes


| first | second | relaunch | Selector press | Reading |
| --- | --- | --- | --- | --- |
| lost | delivered | delivered | delivered | The first outcome was not observed; later gestures worked. Cause remains unproven. |
| lost | lost | delivered | delivered | Outcomes were observed after relaunch; this does not identify a transport cause. |
| lost | lost | lost | delivered | The later selector press worked after failed drag outcomes; both may use private synthesis. |
| lost | lost | lost | lost | No expected outcomes were observed; inspect setup, overlays, app, runner and simulator evidence. |

## Running it

```bash
gh workflow run repro-cold-simulator-touch.yml --ref ci/restore-agent-device \
  -f agent_device_sha="<full-upstream-sha>" -f expectation=prompt -f iterations=3 -f samples=1
gh run list --workflow repro-cold-simulator-touch.yml --limit 5
gh run download <run-id> -D /tmp/repro
```

Locally (a passing run on one host does not establish a hosted cold-start fix):

```bash
AGENT_DEVICE_BIN=/absolute/path/to/agent-device/bin/agent-device.mjs \
  node scripts/repro-cold-simulator-touch.mjs --runtime iOS-26-5 \
  --iterations 1 --expect prompt --out /tmp/repro-smoke
```

Without `--expect`, the driver records observations without enforcing a verdict.
Use `--expect prompt` or `--expect reproduced` for pass/fail validation.
