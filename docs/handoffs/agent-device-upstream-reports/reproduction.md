# Reproduction: first synthesized drag lost on a cold hosted iOS 26.5 simulator

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
   - **XCTest tap**: `press 'id="engine-fallback"'` then `wait text 'engine=fallback'`
     (agent-device's `press` uses the public `XCUICoordinate.tap()` path, not the
     private `XCSynthesizedEventRecord` path the drag uses).
7. Collect `simulator-log.txt` (backboardd, SpringBoard, app), `host-log.txt`
   (testmanagerd, CoreSimulatorService), the recording, the agent-device state
   directory (runner.log, request logs) and `iteration.json`.

`summary.json` and the job step summary hold one row per iteration with
`firstDelivered`, `secondDelivered`, `relaunchDelivered`, `xctestTapDelivered`.

## Results (run 34025552105, macos-26 / iOS 26.5, 4 samples x 3 iterations)

Seven iterations reached the gesture; the first synthesized drag was **lost or late in 3 of them** while the gesture command reported ok, and the delivery-latency distribution across all 21 measured gestures was min 179 ms, median 1100 ms, **p90 15465 ms, max 40918 ms** — the p90 is a full 15 s wait timeout.

| sample/it | first gesture | 1st wait | XCTest tap | note |
| --- | --- | --- | --- | --- |
| 2 / 2 | **lost** | 15.3 s (timeout) | delivered 851 ms | gesture reported ok, durationMs 9850; app never saw it |
| 2 / 3 | **lost** | 40.9 s | delivered 131 ms | delayed burst drained ~40 s late |
| 1 / 2 | **late** | 7.7 s | delivered | reorder committed 7.7 s after touch-down |
| 4 / 1 | errored | 15.5 s (timeout) | delivered 240 ms | gesture command itself exited 1; app also lost |
| 1 / 1, 3 / 1, 3 / 2 | prompt | 0.3-2.7 s | delivered | healthy |

**The discriminator is decisive.** In every lost or late iteration the public XCTest coordinate tap on the same runner, moments later, landed in under a second. So the loss is specific to the private synthesized-event path (`XCSynthesizedEventRecord`/`XCPointerEventPath`), not a simulator-wide input stall. That is what points the fix at the synthesized-gesture path rather than at boot or AX readiness.

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


| first | second | relaunch | XCTest tap | Reading |
| --- | --- | --- | --- | --- |
| lost | delivered | delivered | delivered | Only the first private-synthesis gesture after a cold boot is lost: input pipeline warm-up. |
| lost | lost | delivered | delivered | The first app instance never receives synthesized events; a relaunch heals it. |
| lost | lost | lost | delivered | Private synthesis is broken for the boot while the public XCTest path works: the two paths differ in delivery. |
| lost | lost | lost | lost | Nothing reaches the app: app-side or simulator-wide input stall. |

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

The driver never fails the job on a reproduced defect; it only fails on usage or
setup errors so that all matrix samples report.
