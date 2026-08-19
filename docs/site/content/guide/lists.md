# Virtualized lists

`ReorderableList` is the root-entrypoint FlatList-shaped interface. It retains vertical virtualization while the library owns item identity, cell coordination, scrolling, geometry, and reorder-critical props.

Required props are `data`, `keyExtractor`, `renderItem`, and `onReorder`. Prefer exact `getItemLayout` for fixed or precomputed sizes; otherwise provide a representative `estimatedItemSize` and measured geometry adapts as cells mount.

## Minimal example

Keep the list controlled by rebuilding `data` from the identities in `event.nextOrder`:

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
      getItemLayout={(_data, index) => ({
        index,
        length: 56,
        offset: index * 56,
      })}
      keyExtractor={(row) => row.id}
      onReorder={onReorder}
      renderItem={({ item }) => <Row row={item} />}
    />
  );
}
```

## Optional providers

```tsx
import { ReorderableFlashList } from 'react-native-reorderable/flash-list';
import { ReorderableLegendList } from 'react-native-reorderable/legend-list';
```

Install `@shopify/flash-list@^2.3.2` or `@legendapp/list@^3.3.3` only for the entrypoint you use. Each exposes a list and section-list wrapper. Optional providers are isolated from the root import, and their certified wrappers intentionally reserve provider props that could invalidate portable behavior.

Horizontal, inverted, masonry, and multi-column lists are unsupported in v1.

Inspect the [type-checked example source](https://github.com/thiagobrez/react-native-reorderable/blob/main/example/src/reorder-scenarios.tsx).
