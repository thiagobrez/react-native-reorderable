# SwiftUI Escape cancellation prototype

Issue: [Verify system Escape cancellation in SwiftUI reorder](https://github.com/thiagobrez/react-native-reorderable/issues/20)

## Verdict

SwiftUI's iOS 27 reorder system did **not** cancel an active pointer reorder when an Escape keyboard event arrived. The active reorder committed on pointer release, fired exactly one reorder callback, and moved Blue from position 1 to position 3. A subsequent drag also completed normally.

This is a throwaway evidence surface, not production implementation.

## Environment

- Date: 2026-08-05
- App: `ReorderableExample` (`reorderable.example`), freshly built from this branch
- Device: iPhone 17 Pro simulator, iOS 27.0, UUID `CD1ADD09-474F-4618-899B-689243327BC6`
- Runtime build: `24A5390f`
- Xcode: 27.0 Beta 4 (`27A5228h`)
- Swift: 6.4 (`swiftlang-6.4.0.27.1`)
- Gesture driver: agent-device source commit `7c5b98e8b`, package version 0.20.5

LLDB inspection of this exact launch showed `RNReorderableHostingView` with its fallback `UIView` hidden and a live SwiftUI `_UIHostingView<RNReorderableRootView>`. No application Escape handler or fallback-engine handler was installed. The only production-path SwiftUI modifiers remained `.reorderable()` and `.reorderContainer(...)`.

## Test surface

`example/src/App.tsx` adds visible and accessibility-readable application order plus reorder-callback count, and a reset button. It does not change the reorder engine.

The decisive input used one targeted XCTest `XCSynthesizedEventRecord` with two timestamped paths:

- Touch: Blue position 1 to Yellow position 3; 800 ms source hold, 900 ms movement, 7,000 ms destination hold.
- Keyboard: `XCPointerEventPath.initForTextInput()` plus `typeKey:modifiers:atOffset:` with `XCUIKeyboardKeyEscape` (`0x1b`), no modifiers, at 3.0 seconds.

The keyboard event therefore occurred while the pointer remained down at a confirmed reorder destination. The exact temporary agent-device change is captured in `agent-device-composite-escape.patch`; `runner-evidence.txt` records the composite event and successful gesture synthesis.

## Observations

1. Baseline: callbacks 0; Blue, Green, Yellow, Orange, Pink.
2. Preflight without Escape: Blue moved to position 3; callbacks became 1.
3. Reset restored callbacks 0 and initial application order.
4. Composite touch + Escape: destination feedback was visible, but the list did not return to application order. On release, callbacks became 1 and order became Green, Yellow, Blue, Orange, Pink.
5. With the unmodified runner, a subsequent drag moved Blue from position 3 to position 5; callbacks became 2 and order became Green, Yellow, Orange, Pink, Blue.

## Evidence

- `screenshots/baseline.png`
- `videos/preflight-success.mp4`
- `videos/composite-escape-during-active-drag.mp4`
- `screenshots/after-composite-escape.png`
- `videos/subsequent-drag.mp4`
- `screenshots/after-subsequent-drag.png`

## Contract consequence

SwiftUI exposes the reorder difference only at commit and provides no imperative cancellation handle. An app-level Escape handler therefore cannot convert this native interaction into a cancelled reorder; it would only observe or consume the key while SwiftUI's reorder session remains live.

If the portable contract continues to guarantee Escape cancellation, the SwiftUI-native engine cannot conform and cannot be selected. Because native-when-available is a standing v1 requirement, the recommended resolution is to remove Escape from the v1 portable cancellation guarantee for both engines rather than introduce a behavioral split. Revisit Escape when SwiftUI exposes cancellation or begins cancelling its own reorder session.
