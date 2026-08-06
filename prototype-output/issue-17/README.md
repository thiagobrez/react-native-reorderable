# Issue 17 — fallback performance budget

This is a throwaway release-build benchmark, not production library code. It compares a plain `FlatList` with the smallest credible windowed reorder scaffold at 100, 1,000, and 10,000 heterogeneous-height rows.

## Scaffold under test

Both modes use the same `FlatList` window (`initialNumToRender=12`, `maxToRenderPerBatch=10`, `windowSize=5`, clipped subviews). The fallback adds:

- a long-press pan gesture on each mounted row;
- an estimated-height model corrected by row measurements;
- a Fenwick correction tree and binary-search destination lookup on the UI runtime;
- UI-runtime edge auto-scroll;
- one JS result and optional reorder commit when the gesture finalizes.

No timer, destination callback, or auto-scroll loop crosses to JS while the pointer moves. The prototype intentionally exposes its weakest design choice: each measurement copies two JavaScript arrays into shared values. That is useful for measuring the minimum naive scaffold, but is not an acceptable v1 geometry store.

Run the interactive benchmark with the existing example commands:

```sh
yarn example ios
yarn example android
```

Select `FlatList` or `Fallback`, then select the row count. The on-screen readout reports settle time, visible rows, cumulative mounts/renders, and the last drag's UI update/lookup counts.

## Method

- iOS: iPhone 17 Pro simulator, iOS 27, release app.
- Android: Pixel 10 Pro emulator, Android 17, arm64 release APK.
- Each matrix cell used a fresh release process, selected the mode/size, waited for the 750 ms sample marker, then sampled memory and idle CPU.
- Android frame windows were reset before a 2.5 second idle interval. iOS simulator frame health was unavailable in the installed harness, so no iOS frame number is claimed.
- Fallback cells switch from the baseline screen in the same process. Their memory numbers are therefore conservative upper bounds which retain baseline allocator pages.
- Startup/cold-jank and process-reuse samples were discarded. The Android 1,000-row baseline settle value below is retained and marked as a cold-start outlier, but is excluded from budget derivation.

## Idle results

### iOS simulator

| Mode | Rows | Settle | Visible | Mounts/renders | RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| FlatList | 100 | 17 ms | 10 | 29 / 29 | 421,872 KB |
| FlatList | 1,000 | 61 ms | 10 | 30 / 30 | 409,936 KB |
| FlatList | 10,000 | 21 ms | 10 | 29 / 29 | 429,680 KB |
| Fallback | 100 | 31 ms | 10 | 29 / 29 | 476,576 KB |
| Fallback | 1,000 | 32 ms | 10 | 29 / 29 | 475,136 KB |
| Fallback | 10,000 | 46 ms | 10 | 29 / 29 | 493,136 KB |

Stable idle process CPU was 0.5–0.9% in both modes. The 100-row baseline RSS was sampled after an accessibility capture and is likely inflated; it is not used for a delta claim.

### Android emulator

| Mode | Rows | Settle | Visible | Mounts/renders | PSS | RSS | Idle frames |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| FlatList | 100 | 92 ms | 11 | 32 / 32 | 142,940 KB | 256,752 KB | 17 / 1 dropped |
| FlatList | 1,000 | 1,677 ms* | 11 | 22 / 22 | 143,927 KB | 259,984 KB | 0 / 0 dropped |
| FlatList | 10,000 | 117 ms | 11 | 32 / 32 | 149,867 KB | 263,952 KB | 17 / 1 dropped |
| Fallback | 100 | 44 ms | 11 | 32 / 32 | 198,718 KB | 313,216 KB | 17 / 1 dropped |
| Fallback | 1,000 | 136 ms | 11 | 32 / 32 | 199,682 KB | 313,648 KB | 17 / 1 dropped |
| Fallback | 10,000 | 78 ms | 11 | 32 / 32 | 213,657 KB | 328,208 KB | 17 / 1 dropped |

`*` Cold-start outlier; excluded from the budget. Stable idle process CPU rounded to 0% in every Android cell.

Mount/render counts remain flat from 100 to 10,000 rows, so the window remains virtualized. The naive fallback adds roughly 50–56 MB of fixed process memory when the worklet runtime is first activated, then another 14–18 MB by 10,000 rows. The row-count slope is the decisive failure: shared JavaScript arrays are not a viable production geometry owner.

## Active drag probe

The installed agent-device 0.20.2 does not support the newer held `gesture drag` command. A slow 2.5 second `gesture pan` was used instead: its first 220 ms stays inside the pan tolerance, allowing the app's real long-press activation to fire before movement. This worked on Android and did not activate on iOS, so iOS active-drag performance remains an explicit physical-device gate.

At 10,000 rows, Android reported 145–148 UI updates, at most 13 lookup steps per update, destination 2, and one finalize result to JS. Thirteen steps is consistent with logarithmic lookup (`ceil(log2(10,000)) = 14`). The [video](android/active-drag.mp4) and [readout](android/after-drag.png) capture the successful probe.

Android emulator frame health for the identical 2.5 second upward pan was:

| Mode | Total frames | Missed deadlines | Worst frame |
| --- | ---: | ---: | ---: |
| Plain FlatList scroll | 133 | 72 (54.1%) | 376.2 ms |
| Fallback active drag | 143 | 85 (59.4%) | 312.8 ms |

The emulator/input injector is severely overloaded in both cases, so these are comparative evidence only. The fallback added 5.3 percentage points of missed deadlines; neither result can validate a user-facing 60 Hz claim.

## Proposed v1 budgets

These are release gates, not promises inferred from simulator timing:

| Area | v1 budget |
| --- | --- |
| Virtualization | At 10,000 rows, mounted and rendered cells must stay within `FlatList ±2`; no list-size-proportional React work. |
| Idle scheduling | No continuous JS/UI timer or frame callback; ≤1 percentage point CPU above the paired `FlatList`; no additional idle missed-frame percentage. |
| Settle | At 10,000 rows, ≤2× paired `FlatList` and no more than +25 ms iOS / +50 ms Android on the minimum supported physical devices. |
| Geometry memory | After the worklet runtime is warm, ≤8 MB fixed plus ≤64 bytes/item (≤8.64 MB at 10,000 rows). Cold worklet-runtime activation must remain ≤60 MB and be reported separately. |
| Destination lookup | UI-runtime only, `O(log n)`, at most 15 search steps at 10,000 rows, and no JS calls during pointer updates. |
| Active frame health | On minimum supported physical devices, <5% missed deadlines and no more than +2 percentage points versus a paired native scroll/drag control; p95 library UI work ≤4 ms. |
| Measurement correction | `O(log n)` mutation with no `O(n)` copy; ≤1 ms per correction, ≤4 corrections per frame, and ≤2 px anchor displacement. |
| Finalization | Exactly one JS result per completed/cancelled gesture; at most one reorder state commit. |

## Verdict and API constraints

The windowing, idle, settle, and lookup shape are credible. The prototype does **not** pass the proposed v1 budget because geometry memory grows by about 14–18 MB at 10,000 rows, measurement correction copies whole arrays, Android active drag exceeded the comparative frame-delta target, and no physical-device/iOS active result exists.

The production fallback must therefore use an engine-owned compact mutable geometry coordinator (chunked worklet storage, typed native storage, or equivalent), not React state or copied shared-value arrays. That decision constrains the public API:

- stable item keys are mandatory;
- the engine owns row measurement, scroll observation, destination lookup, and edge auto-scroll;
- estimated geometry may be configured at list level, but measurement maps and per-frame tuning are not public state;
- pointer-move destination callbacks are forbidden; consumers receive lifecycle/finalization events only;
- row/list wrappers must compose consumer props while retaining the engine's measurement and gesture hooks.

Before implementation is called shippable, rerun the active and memory gates on the minimum supported physical iOS and Android devices with the production geometry owner.
