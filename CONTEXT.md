# Reorderable

The language for a React Native library that reorders items within and between
collections and supports drag-and-drop interactions.

## Language

**Native reorder**:
Reordering performed by a platform-native engine when that capability is
available. It does not imply that every supported platform or runtime uses the
native engine.
_Avoid_: Native-only reorder, universally native reorder

**Fallback reorder**:
Reordering performed by the library's cross-platform engine when native reorder
is unavailable. It is supported behaviour, not a degraded or no-op mode.
_Avoid_: Non-native reorder, degraded reorder
