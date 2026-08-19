# Controlled reorder

A reorder callback reports a commit; it does not mutate application data.

```ts
type ReorderEvent = Readonly<{
  sourceIds: readonly string[];
  destination: Readonly<{
    sectionId: string | null;
    beforeId: string | null;
  }>;
  nextOrder: readonly Readonly<{
    sectionId: string | null;
    itemIds: readonly string[];
  }>[];
}>;
```

- `sourceIds` is the canonical move set in its pre-move collection and item order.

- `destination.sectionId` identifies the destination section. It is `null` for an unsectioned collection.

- `destination.beforeId` identifies the item immediately after the insertion point. It is `null` when inserting at the end of the destination collection.

- `nextOrder` is the proposed complete order, reconciled against the latest rendered identities. Render it to accept the commit, apply it later to delay the update, or keep the previous order to restore it.

Do not calculate a destination index from stale arrays. Build the next data value from `nextOrder` identities and attach the callback with `onReorder`:

```tsx
function Colors() {
  const [rows, setRows] = useState(initialRows);

  const onReorder = (event: ReorderEvent) => {
    const items = new Map(rows.map((row) => [row.id, row]));
    setRows(
      event.nextOrder[0]!.itemIds.flatMap((id) => {
        const row = items.get(id);
        return row ? [row] : [];
      })
    );
  };

  return (
    <ReorderableList
      data={rows}
      keyExtractor={(row) => row.id}
      onReorder={onReorder}
      renderItem={({ item }) => <Row row={item} />}
    />
  );
}
```

Data-driven entry and exit outside an active reorder is normal. During a live interaction, identity or structural changes cancel rather than producing a partial or stale commit.

Inspect the [type-checked example source](https://github.com/thiagobrez/react-native-reorderable/blob/main/example/src/reorder-scenarios.tsx).
