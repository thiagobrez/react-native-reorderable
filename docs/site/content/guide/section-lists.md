# Section lists

`ReorderableSectionList` accepts sections shaped as `{ id, data }`. Section IDs and item IDs are stable and non-empty. A reorder can move one atomic move set across populated or empty collections.

`keyExtractor(item, index, section)` and `renderItem({ item, index, section })` receive the owning section. `renderSectionHeader` and `renderSectionFooter` are supported.

For exact geometry, `getItemLayout(sections, sectionIndex, itemIndex)` returns the row's `length` and absolute content `offset`. The offset includes every preceding row and all preceding/current section header and footer chrome. See [geometry and performance](./geometry-performance).

Accept sectioned `event.nextOrder` by matching `sectionId`, then rebuilding each section's data from the returned item identities. Preserve empty sections even when their `itemIds` array is empty.

## Minimal example

This example supports reordering within and across sections while keeping the section list controlled:

```tsx
function Board() {
  const [sections, setSections] = useState(initialSections);

  const onReorder = (event: ReorderEvent) => {
    const items = new Map(
      sections.flatMap((section) =>
        section.data.map((item) => [item.id, item] as const)
      )
    );
    const itemIdsBySection = new Map(
      event.nextOrder.map(({ sectionId, itemIds }) => [sectionId, itemIds])
    );

    setSections(
      sections.map((section) => ({
        ...section,
        data: (itemIdsBySection.get(section.id) ?? []).flatMap((id) => {
          const item = items.get(id);
          return item ? [item] : [];
        }),
      }))
    );
  };

  return (
    <ReorderableSectionList
      sections={sections}
      estimatedItemSize={56}
      keyExtractor={(item) => item.id}
      onReorder={onReorder}
      renderItem={({ item }) => <Row item={item} />}
      renderSectionHeader={({ section }) => (
        <Header title={section.title} />
      )}
    />
  );
}
```

Inspect the [type-checked example source](https://github.com/thiagobrez/react-native-reorderable/blob/main/example/src/reorder-scenarios.tsx).
