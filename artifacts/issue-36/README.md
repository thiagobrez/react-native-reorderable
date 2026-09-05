# Issue 36 device evidence

Validated against fresh debug builds with `@shopify/flash-list@2.3.2` on:

- iOS 27.0 (24A5390f), iPhone 17 Pro, Auto and forced Fallback policies;
- iOS 26.5 (23F77), iPhone 17 Pro, Auto policy's runtime fallback; and
- Android, Pixel 10 Pro emulator, Auto policy.

The reusable gate at the time was `yarn verify:flash-device --platform
<ios|android> --device <name> --engine <auto|fallback> --session <name>`
(removed with the manual device gates in #75). Its four successful
runs and screenshots are under `matrix/`. It asserts provider windowing,
selected multi-row reorder, edge auto-scroll into an initially off-window
destination, section rendering, and in-flight cancellation by disabling three
seconds into a 6.5-second hold. The verifier has one bounded readiness wait and
no retry or swallowed assertion path. The iOS runs additionally reach the empty
ending section. Android's helper could not reliably prove absolute `scroll
bottom`, so its bounded shared path performs a normal section scroll.

- iOS 27 Auto: 18 of 120 rows mounted; source IDs `flash-7, flash-9` committed
  before `flash-10`; cancellation emitted zero reorder callbacks.
- iOS 27 forced Fallback: 18 of 120 rows mounted; source IDs `flash-7,
  flash-9` committed before `flash-10`; cancellation emitted zero callbacks.
- iOS 26.5 Auto/runtime fallback: 18 of 120 rows mounted; source IDs `flash-7,
  flash-9` committed before `flash-10`; cancellation emitted zero callbacks.
- Android Auto: 19 of 120 rows mounted; source IDs `flash-7, flash-9` committed
  before `flash-17`; cancellation emitted zero callbacks.

On iOS the 465-point viewport initially ended within row 7; row 9 and
destination row 10 were outside it. `beforeId: flash-10` therefore requires
edge auto-scroll. The assertion uses the application identity from the
canonical reorder event, so removing the two selected source items during
destination-index translation does not weaken the proof. Android's
`beforeId: flash-17` advances farther beyond its initial viewport.

The Android MP4 files contain the full 6.5-second production long-press,
auto-scroll/recycling, release, and committed state. Their adjacent telemetry
files were emitted by `agent-device` while exporting the recordings.

No React Native error overlay, fatal Android exception, or JavaScript runtime
error appeared during these runs. The demo arms cancellation before the hold
and disables the wrapper from an application timer while the serialized device
long-press remains active, so the zero-callback assertion covers real in-flight
device cancellation in addition to the deterministic interaction tests.
