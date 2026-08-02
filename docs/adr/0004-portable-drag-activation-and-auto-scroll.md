# Use whole-item long press and zero-config auto-scroll

V1 uses the whole item as the portable drag activation region for reorder and drag-and-drop, with a platform-appropriate long press and no functional handle, imperative `drag()` callback, or activation-delay configuration; apps may render a non-exclusive visual grip. Auto-scroll is always enabled only where the library owns the scroll viewport, with no public threshold or velocity tuning, because SwiftUI cannot honor those controls and the fallback engine should hide its additional machinery behind the same narrow interface.
