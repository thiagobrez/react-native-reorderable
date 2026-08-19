# Drag and drop

Drag-and-drop is a sibling interface, not a reorder mode:

```tsx
<DragDropContainer selectedIds={selectedIds} onDrop={handleDrop}>
  <DraggableItem id="card-a"><Card /></DraggableItem>
  <DropZone id="archive" canDrop={(ids) => ids.every(canArchive)}>
    <ArchivePanel />
  </DropZone>
</DragDropContainer>
```

One `DragDropContainer` defines a drag-and-drop scope. A move set cannot cross scopes. `canDrop` is synchronous; it is snapshotted once when a pointer drag activates, so prop changes apply to the next pointer interaction. An accessible drop checks the current predicate when invoked.

`onDrop({ itemIds, destinationId })` reports an accepted, completed drop commit. It cannot reject the delivery. Removing the active source or destination, disabling/unmounting the container, or other cancellation inputs emits no callback.

Reorder and drag-and-drop containers cannot nest or interoperate in v1 because both own the same whole-item activation gesture.

Inspect the [type-checked example source](https://github.com/thiagobrez/react-native-reorderable/blob/main/example/src/drop-scenarios.tsx).
