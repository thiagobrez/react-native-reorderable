# Issue 37 device evidence

Validated against `@legendapp/list@3.3.3` and the exact issue 37 source on:

- iOS 27.0 (24A5390f), iPhone 17 Pro, Auto and forced Fallback policies;
- iOS 26.5 (23F77), iPhone 17 Pro, Auto policy's runtime fallback; and
- Android, Pixel 10 Pro emulator, Auto policy.

The reusable gate at the time was `yarn verify:legend-device --platform
<ios|android> --device <name> --engine <auto|fallback> --session <name>`
(removed with the manual device gates in #75). Its four successful
runs and screenshots are under `matrix/`. It asserts provider windowing,
selected multi-row reorder, edge auto-scroll into an initially off-window
destination, provider-native section rendering, empty start/end sections, the
typed `SectionListRef` viewport, and in-flight cancellation by disabling three
seconds into a 6.5-second hold. The verifier has bounded readiness waits and no
silent retry or swallowed assertion path. It also records the peak live row
count across the real-provider auto-scroll and fails if it exceeds 60 of 120,
so a transient full-data mount cannot pass the gate.

- iOS 27 Auto: 15 of 120 rows mounted, peak 16; source IDs `legend-7, legend-9`
  committed before `legend-10`; cancellation emitted zero callbacks.
- iOS 27 forced Fallback: 15 of 120 rows mounted, peak 16; source IDs `legend-7,
legend-9` committed before `legend-10`; cancellation emitted zero callbacks.
- iOS 26.5 Auto/runtime fallback: 15 of 120 rows mounted, peak 16; source IDs `legend-7,
legend-9` committed before `legend-10`; cancellation emitted zero callbacks.
- Android Auto: 16 of 120 rows mounted, peak 19; source IDs `legend-7, legend-9`
  committed before `legend-12`; cancellation emitted zero callbacks.

On iOS, row 9 and destination row 10 were initially outside the viewport. On
Android, destination row 12 was initially outside the viewport. The canonical
event therefore proves that the stationary-edge hold auto-scrolled through the
provider viewport while preserving the selected move set.

The visible `End` control uses the wrapper's public typed Legend
`SectionListRef` and calls `scrollToEnd`. The verifier invokes it twice because
Legend first materializes the final variable-height rows, corrects its adaptive
estimate, and then needs the same public operation to align with the corrected
end. Screenshots prove `Empty end footer` after that correction; the initial
section snapshot proves `Empty start`, while deterministic component coverage
proves movement through the empty middle destination.

No React Native error overlay, fatal Android exception, or JavaScript runtime
error appeared during the successful matrix. An earlier performance run caught
and eliminated a provider-boundary crash before device certification: Legend
invokes `renderScrollComponent` as a callback, so the wrapper translates the
library-owned forwarded-ref component into Legend's callable renderer shape.

`android-end-debug.png` and `android-end-debug-2.png` preserve the diagnostic
sequence that established Legend's two-phase end correction on Android: the
first public `scrollToEnd` materialized rows 111–119 and the second aligned the
now-measured empty end footer. They are supplemental provenance for the
deterministic two-call assertion, not additional matrix runs.
