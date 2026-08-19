# Geometry and performance

Use `ReorderableList` or a provider wrapper for large collections. The children API intentionally assumes fully mounted content.

For fixed or precomputed rows, provide exact geometry. Flat offsets are content-relative:

```tsx
getItemLayout={(_data, index) => ({
  index,
  length: ROW_HEIGHT,
  offset: index * ROW_HEIGHT,
})}
```

Section offsets must also include section headers and footers. If exact geometry is unavailable, set `estimatedItemSize` near the median row height. The coordinator uses compact measured overrides as rows mount; stable estimates reduce correction during long drags.

Auto-scroll is always enabled for library-owned list viewports. Its thresholds and velocity are private engine behavior. Destination lookup stays logarithmic for exact and measured geometry; do not disable virtualization or render thousands of children to work around off-window movement.

Keep `keyExtractor`, render callbacks, data references, and geometry callbacks stable where practical. Avoid changing data identity or layout structure during an active drag: structural changes cancel to preserve atomic reconciliation.
