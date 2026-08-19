# Engine policy

`engine="auto"` is the default. It uses native reorder only when that capability is available (e.g. SwiftUI's `.reorderable` modifier on iOS 27+) and silently selects the supported fallback reorder on older iOS versions, Android, or a runtime without that native capability.

`engine="fallback"` requires the cross-platform engine for the container, based on Reanimated and React Native Gesture Handler. Use it when consistency matters most than native-feel or performance.

Native reorder and fallback reorder expose the same contract: whole-item long press, destination feedback, auto-scroll, atomic commits, controlled reconciliation, cancellation semantics, and semantic accessibility actions. Presentation and motion may differ.

If no engine can fulfill the contract for an enabled container, the library throws a descriptive error. Setting `enabled={false}` renders content without an active interaction engine.
