> Historical report draft. Its causal and timing claims are superseded by the [current reassessment](./fix-proposal.md). Do not file this text verbatim.

# Upstream report 1 (draft for callstack/agent-device)

**Suggested title:** `gesture drag` reports `ok=1` but the app receives no touch stream on a freshly erased, cold-booted iOS 26.5 simulator (GitHub-hosted macos-26)

---

## Summary

On a GitHub-hosted `macos-26-arm64` runner, the first `gesture drag` synthesized into a freshly erased and cold-booted iOS 26.5 simulator completes with `AGENT_DEVICE_RUNNER_COMMAND_COMPLETED ... ok=1` and exactly the scripted duration, while the app under test never receives the touch stream. The screen stays pixel-static through the gesture and for 30 s afterwards; the app's own counters stay at zero. When the runner is restarted a minute later in the same job, the identical gesture on the same screen activates within ~2 s.

In an earlier run on the same hosted image the touch stream did arrive, but ~3.5–4.5 s after touch-down. So delivery is late on this environment, and when the delay exceeds the gesture's own duration the gesture is silently lost. The runner has no way to tell us, and `ok=1` is misleading.

Not reproducible locally (3/3 passes with instant activation on an Apple Silicon Mac with the same runtime, agent-device version and app build).

## Environment

- agent-device **0.20.10** (npm), invoked via `node_modules/.bin/agent-device`
- Node **24.13.0** (GitHub hosted toolcache)
- GitHub-hosted runner image **macos-26-arm64**, version **20260728.0273.1**
- Xcode **26.6** (`/Applications/Xcode_26.6.app`), iPhoneSimulator SDK 26.5
- iOS Simulator runtime **iOS 26.5 (23F77)**, device **iPhone 17 Pro**
- App under test: React Native 0.85 Release build; the drag activates a `react-native-gesture-handler` `Pan().activateAfterLongPress(350)` gesture
- Simulator is `xcrun simctl shutdown` → `erase` → `boot` → `bootstatus -b` immediately before the job's first agent-device session (cold, freshly migrated data: `bootstatus` reports ~30 s of "Waiting on Data Migration")

## Exact commands

Preflight (once per job, after boot and `simctl install`):

```
agent-device daemon stop
agent-device prepare ios-runner --platform ios --session issue39-ios-runner-preflight --udid <UDID> --timeout 300000
agent-device open reorderable.example --relaunch --platform ios --session ... --udid <UDID>
agent-device wait "Scenario Lab" 15000 --depth 100 ...
agent-device open "reorderable://lab/free-form?preset=teaching&engine=auto" ...
agent-device alert accept ...
agent-device close ...
```

Scenario replay (`agent-device replay pointer-replay.ad --session issue39-free-form-reorder`), where the script is:

```
context platform=ios kind=simulator timeout=60000
env APP_TARGET="reorderable.example"
env DEEP_LINK="reorderable://lab/free-form?preset=teaching&engine=auto"
open "${APP_TARGET}" --relaunch
wait "Scenario Lab" 15000
open "${DEEP_LINK}"
wait "Current order: card-0, card-1, card-2, card-3, card-4, card-5" 15000
wait "Current selection: none" 15000
wait "Last committed event: None" 15000
wait "Callback count: 0" 15000
screenshot ".../baseline.png"
wait 1000
screenshot ".../gesture-start-marker.png"
gesture drag "id=\"card-card-0\"" "id=\"card-card-3\"" 650 1200 8000
wait "Current order: card-1, card-2, card-0, card-3, card-4, card-5" 15000
wait "Current selection: none" 15000
wait "Last committed event: {\"sourceIds\":[\"card-0\"],\"destination\":{\"sectionId\":null,\"beforeId\":\"card-3\"}}" 15000
wait "Callback count: 1" 15000
screenshot ".../terminal.png"
```

The recording is a device-scope `record start … --scope device` / `record stop` around the whole replay. All 12 pre-gesture steps pass; the app is on screen, the deep-linked list is rendered, and `findText`/`snapshot` work throughout (the accessibility path is healthy).

## Observed: failing run (2026-09-01)

Run: https://github.com/thiagobrez/react-native-reorderable/actions/runs/33488489650 (job `ios26.auto-fallback / RN 0.85`, attempt 1)

Runner log (`sessions/issue39-ios-runner-preflight/runner.log`, runner PID 17428):

```
2026-09-01 09:05:19.026160+0000 AgentDeviceRunnerUITests-Runner[17428:50059] AGENT_DEVICE_RUNNER_COMMAND_ACCEPTED command=gesture commandId=runner-57219b81-e2a7-471a-8c35-a534b247d1fe
2026-09-01 09:05:19.027131+0000 AgentDeviceRunnerUITests-Runner[17428:48965] AGENT_DEVICE_RUNNER_FAST_APP_GUARD command=gesture bundle=reorderable.example state=4
2026-09-01 09:05:30.329312+0000 AgentDeviceRunnerUITests-Runner[17428:50059] AGENT_DEVICE_RUNNER_COMMAND_COMPLETED command=gesture commandId=runner-57219b81-e2a7-471a-8c35-a534b247d1fe ok=1
```

Daemon events for the session (`events.ndjson`):

```
09:05:16.040 request.started  gesture
09:05:30.338 action.recorded  gesture   {"durationMs":9850,"pointerCount":1}
09:05:30.339 request.finished gesture   ok  durationMs=14299
09:05:30.340 request.started  wait "Current order: card-1, card-2, card-0, ..."
09:05:45.458 request.finished wait      error COMMAND_FAILED durationMs=15119
```

CLI output:

```
Error (REPLAY_DIVERGENCE): Replay failed at step 12 (wait "Current order: card-1, card-2, card-0, card-3, card-4, card-5" 15000): wait timed out for text: Current order: card-1, card-2, card-0, card-3, card-4, card-5. Current surface: Back to scenario ...
```

The app-side evidence says nothing happened:

- `Callback count: 0`, order unchanged, no lift/border highlight in any screenshot taken during or after the gesture (`sample-1..3.png`).
- The recording (`free-form-reorder.pointer.mp4`, 56.5 s, variable frame rate) contains **no frame between t=13.3 s and t=56.5 s**. Aligned to the daemon timeline (recording starts with the replay at 09:05:04.3), the gesture was accepted at t≈14.7 s and completed at t≈26.0 s, so the screen was pixel-static through the entire 9.85 s gesture and the following 30 s of waits. Frame-to-frame mean pixel difference over that window is exactly zero.

### Same job, one runner restart later, the identical gesture works

After the divergence our harness closes the session and the daemon/runner restart (new runner PID 27197). `virtualized-list-reorder` uses the same interaction shape (first row dragged before the fourth row, same `650 1200 8000` timings) on a different screen:

```
2026-09-01 09:07:21.447542+0000 AgentDeviceRunnerUITests-Runner[27197:72995] AGENT_DEVICE_RUNNER_COMMAND_ACCEPTED command=gesture ...
2026-09-01 09:07:32.124743+0000 AgentDeviceRunnerUITests-Runner[27197:72995] AGENT_DEVICE_RUNNER_COMMAND_COMPLETED command=gesture ... ok=1
```

Its recording shows continuous frame changes starting ~1.7 s after touch-down (lift + move animation) and a final change at release (commit). `multi-selection-reorder`, which renders the **same component** as the failing scenario, also passed in that job. Screen, component, selectors and expectations are exonerated; only the first gesture into the cold simulator is lost.

## Observed: late delivery on the same image (2026-08-31)

Run: https://github.com/thiagobrez/react-native-reorderable/actions/runs/33355396042 (same job name, attempt 2, same image version 20260728.0273.1)

```
2026-08-31 04:30:10.748949+0000 AgentDeviceRunnerUITests-Runner[92119:238107] AGENT_DEVICE_RUNNER_COMMAND_ACCEPTED command=gesture ...
2026-08-31 04:30:22.789525+0000 AgentDeviceRunnerUITests-Runner[92119:238107] AGENT_DEVICE_RUNNER_COMMAND_COMPLETED command=gesture ... ok=1
```

Daemon: gesture request 04:30:10.248 → 04:30:22.816 (`durationMs` 12568); the following `wait "Current order: card-1, card-2, card-0, ..."` passed in **46 ms**, so the reorder had already committed by release.

Recording (`free-form-reorder.attempt-2.pointer.mp4`, 37.1 s, aligned to replay start 04:29:46.5): touch-down at t≈24.2 s; the first visible lift/move frames appear at **t=27.6–28.9 s**, i.e. **~3.4–4.7 s after touch-down**, although the scripted source hold is 650 ms and the long-press threshold is 350 ms. The move (scripted for t≈24.85–26.05) shows up as a single burst, after which the card sits at the destination until release.

So on this environment the synthesized stream reaches the app seconds late; in the failing run the delay exceeded the whole gesture and nothing arrived. Our earlier CI history has the same shape: two passes on this image on 2026-08-31, then failures in most runs since, always on whichever pointer scenario runs first after the cold boot.

In this run's attempt 1 (also cold), `wait "Scenario Lab" 15000` timed out at step 2 right after `open --relaunch`, and `bootstatus` had shown ~100 s of data migration. The hosted host is slow to bring the cold simulator to a usable state; the lost touch stream appears to be the input-pipeline flavour of the same slowness.

## Why we are filing this here

- The runner reported success (`ok=1`, `durationMs` 9850, `pointerCount` 1) for a gesture that had no observable effect. Whether the loss is in Apple's XCTest/HID injection on a cold simulator or in the runner's synthesis path is not distinguishable from outside, but agent-device is the layer that could detect and report it.
- Nothing in the app can see an event that never arrives; `snapshot`, `findText` and `wait` do not exercise the touch path, so no amount of pre-gesture settling helps (we tried 6 s pre-gesture settles and 1200 ms source holds on `fix/ios26-gesture-cooldown`; still lost).

## Questions / asks

1. Is this a known limitation of XCUITest touch synthesis on a freshly booted simulator on slow virtualized hosts? If yes, a note in `help workflow` (Apple CI section) would save others the diagnosis.
2. Could `prepare ios-runner` (or an opt-in flag) run an **input-readiness probe** on cold simulators: one observable throwaway touch with bounded retry, so that the first real gesture is not the probe? We designed this locally (press a chip, wait for its observable effect) but did not ship it because we re-routed iOS 26 pointer tests to another driver instead.
3. Could `gesture` surface *some* delivery signal when available (e.g. the runner observing that the target element did not change state, or timing telemetry for when the first touch event was dispatched vs accepted)? Today `ok=1` with the exact scripted duration is indistinguishable from success.

## What we did meanwhile

- Diagnosis with evidence: https://github.com/thiagobrez/react-native-reorderable/issues/54
- Decision: route iOS 26 pointer scenarios through Detox and keep agent-device on iOS 27 (native and fallback engines): https://github.com/thiagobrez/react-native-reorderable/issues/60
- Happy to test a probe or a fix on our hosted matrix; the failing job is reproducible in CI within a few runs.

## Attachments

- `free-form-reorder.pointer.mp4` (failing run, pixel-static through the gesture)
- `virtualized-list-reorder.pointer.mp4` (same job after runner restart, works)
- `runner.log` (failing run, full runner log), `free-form-reorder.events.ndjson`, `free-form-reorder.replay-request.aed3651e9dc0eaca.ndjson`, `free-form-reorder.pointer-replay.ad`
- `sample-1.png`, `sample-2.png`, `sample-3.png` (failing run, app during/after gesture)
- `free-form-reorder.attempt-2.pointer.mp4`, `free-form-reorder.attempt-2.events.ndjson` (late-delivery run)
