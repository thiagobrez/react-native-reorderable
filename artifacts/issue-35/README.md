# Issue 35 device evidence

Validated on the Android example app with the 24-section, 525-row exact-geometry scenario.

- `android-edge-longpress-sections.mp4` / `android-edge-longpress-sections-after.png`: a supported 6.5-second stationary long press on visible `section-1-row-5` inside the bottom auto-scroll band traverses several viewports, keeps the mounted window bounded (23 initially, 40/525 after), releases normally, and commits exactly once before `section-1-row-24`.
- `android-edge-stationary.mp4` / `android-edge-after.png`: a low-delta pan shows continuous blue destination feedback while recycling into section 2. The device injector remained held at the end of this auxiliary run, so it is evidence for feedback/cross-section scrolling only; the long-press run above is the terminal-release proof.

The iOS and Android percentage-padding/row-gap preset was also toggled and scrolled through live virtualization without geometry contradictions; those exploratory logs remain local rather than staged.
