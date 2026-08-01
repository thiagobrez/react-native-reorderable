# Issue 7 fallback-engine prototype

> PROTOTYPE — throwaway evidence, not library code.

This branch answers whether a Reanimated 4 + Gesture Handler 3 engine can
approximate the existing SwiftUI reorder path. The example app renders both
engines at once from the same five-card dataset.

Run it with one command:

```sh
yarn example ios
```

## What the probe exposes

- Five heterogeneous rows (46, 72, 54, 86, and 50 points) in both engines.
- Actual fallback `onLayout` measurements beside each row.
- Independent native and fallback order readouts plus a final match/differ
  indicator.
- The fallback engine's midpoint/index decisions and final drop order.
- An opt-in mutation that grows the yellow row from 54 to 104 points 600 ms
  into a fallback drag.

The fallback keeps the dragged row on the UI thread, animates displaced rows
with Reanimated springs, and sends threshold crossings to JavaScript to update
the canonical order. Its index thresholds are computed from measured geometry
anchored at drag start.

## Manual comparison

1. Reset, then drag Blue below Yellow in the native column.
2. Repeat the same movement in the fallback column; compare the order readouts
   and the feel of lift, displacement, and settling.
3. Reset, enable mid-drag resize, then hold and slowly drag fallback Blue past
   Yellow for longer than 600 ms. Watch whether the resized geometry causes a
   jump, wrong index, or unstable threshold.
4. Repeat with Orange moving upward across the short rows.

The iOS simulator automation available for this run cannot synthesize the
continuous stationary-hold-then-move contact needed for a trustworthy native
drag. Drag behavior therefore requires this short manual pass.

## Evidence captured so far

- `screenshots/baseline.png` — both engines rendered with equal source order and
  heterogeneous measured heights.
- `screenshots/resize-armed.png` — the mid-drag mutation control enabled.
- `/Users/thiagobrez/Downloads/Screen Recording 2026-08-01 at 17.50.04.mov` —
  first manual comparison. The fallback committed the correct final index, but
  its active row did not visually follow the pointer. This exposed a prototype
  bug: the gesture update calculated the active top for index selection without
  writing it back to the Reanimated shared value. The follow-up commit corrects
  that wiring; tactile comparison remains pending a retest.
- `recording-review/contact-sheet.png` — sampled frames from that recording,
  confirming that surrounding fallback rows displaced while the active Blue row
  stayed pinned until it appeared in the correct final slot.
- TypeScript, ESLint, CocoaPods installation, and an Xcode 27 Beta 4 iOS
  simulator build all pass.
- Gesture Handler 3.1.0 emits an Xcode 27 warning because its iOS pan
  recognizer declares `activateAfterLongPress` as both a `CGFloat` property and
  a `void` selector. The build succeeds and the recognizer begins, but manual
  drag validation must cover this version/toolchain seam.

## Windowed-list implication under test

This prototype can only choose a drop index from measured rows. A virtualized
engine cannot extend this exact algorithm beyond the render window: it needs an
estimated layout model for unseen rows, a prefix-sum/index structure updated by
real measurements, and scroll-offset compensation. That is architectural work,
not a missing condition in this five-row implementation.
