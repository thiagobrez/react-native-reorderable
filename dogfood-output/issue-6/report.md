# iOS native-path interaction audit

- Date: 2026-08-01
- Target: `ReorderableExample` (`reorderable.example`)
- Platform: iPhone 17 Pro simulator, iOS 27
- Drivers: agent-device 0.20.2 (`issue6`) plus a manual pointer recording supplied by the user
- Scope: Wayfinder ticket “Audit what the current iOS-native implementation actually does today”

## Confirmed observations

- The example launches on the iOS 27 simulator and exposes the Single, Sections, and Multi-drag demos.
- The native host is positively known to be installed from the LLDB hierarchy captured in the resolved toolchain prerequisite.
- Tab selection works through agent-device coordinate presses.
- Multi-drag's nested Pressables work: tapping the blue and green cards produces visible white selection outlines.
- A manual same-collection drag moved green from position 2 to position 3. The surrounding rows displaced live during the drag, and the final order remained blue, yellow, green, orange, pink after release.
- A manual cross-section drag moved blue from Favorites position 1 to Others position 2. The final sections remained Favorites = green, yellow and Others = orange, blue, pink.
- A manual cancel dragged blue beyond the collection and released it outside a valid destination. The preview detached from the row while the other rows displaced, then the list returned to its original order.
- A manual multi-item interaction selected blue, green, and pink through the nested Pressables. Dragging pink showed a stacked preview with a `+3` badge; dropping populated the zone with blue, green, and pink in selection/source order and cleared the selection outlines.
- No visible JS/native animation fight, stale duplicate, crash, or loss of responsiveness appeared after the successful or cancelled drags.

## Automation boundary

The agent-device-only negative drag results are **not a library failure**. SwiftUI drag initiation requires one continuous hold-then-move contact. This agent-device version exposes `longpress` and `gesture pan` as separate contacts and has no compound hold-then-drag command. Gesture telemetry also shows iOS pan synthesis replaying as short swipe contacts (roughly 390–695 ms in these captures), despite larger requested durations.

The supplied manual recording provides the drag-specific observations above. Agent-device independently verified taps, selection, layout, post-synthetic-gesture state, and responsiveness.

## Coverage gaps in the current example

- No demo contains enough overflowing content to exercise edge auto-scroll.
- All reorder rows are the same height; heterogeneous item sizes are not represented.
- The recording establishes that state commits after drop and does not visibly fight the native animation, but it does not instrument callback timestamps or prove the exact number of `onMove`/`onDrop` emissions.
- Fast repeated successful drags were not stressed; two consecutive successful reorder flows and a multi-item drop completed without visible degradation.

## Evidence

- `screenshots/loaded-single.png`
- `screenshots/sections-baseline.png`
- `screenshots/multi-selected-blue-green.png`
- `videos/single-longpress.mp4`
- `videos/sections-cross-reorder.mp4`
- `videos/multi-selected-pan-10s.mp4`
- `videos/single-fast-repeated.mp4`
- Matching `*.gesture-telemetry.json` files in `videos/`
- `/Users/thiagobrez/Downloads/Screen Recording 2026-08-01 at 16.22.06.mov` (manual source recording, supplied by the user and left untouched)
