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
