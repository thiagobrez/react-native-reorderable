# Free-form children

Use `ReorderableContainer`, `ReorderableItem`, and optional `ReorderableSection` when every item is mounted and you need a composed vertical layout rather than a virtualized viewport.

```tsx
<ReorderableContainer onReorder={accept} selectedIds={selectedIds}>
  {rows.map((row) => (
    <ReorderableItem accessibilityLabel={row.label} id={row.id} key={row.id}>
      <Card row={row} />
    </ReorderableItem>
  ))}
</ReorderableContainer>
```

Direct reorder children must be reorderable items or sections; a section may contain reorderable items. Items can contain arbitrary React Native content. A visual grip is only a cue: v1 deliberately makes the whole item the drag activation region and has no exclusive drag-handle API.

Do not use the children interface for long data sets; use a [list wrapper](./lists) so off-window destinations and auto-scroll remain available.

Inspect the [type-checked example source](https://github.com/thiagobrez/react-native-reorderable/blob/main/example/src/reorder-scenarios.tsx).
