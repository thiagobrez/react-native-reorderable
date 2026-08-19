# Accessibility

VoiceOver and TalkBack receive library-owned semantic actions with the same commit and reconciliation path as pointer reorder.

- Reorderable items expose move-earlier and move-later actions when a destination exists.
- Acting on a selected item moves the complete reorder selection atomically.
- Drop zones expose a drop-selected-items action when the current move set is accepted.
- The library announces completion, retains focus, and exposes collection position metadata.

Applications must provide meaningful `accessibilityLabel` values, accessible selection controls/state, and localized copy. Override action labels and announcements with `accessibilityStrings`; omitted fields retain library defaults.

Accessible reorder does not simulate a pointer drag. Keyboard-only reorder without a screen reader is not part of the v1 contract. Any extra native accessible-drag presentation is engine-specific and should not be required by application logic.
