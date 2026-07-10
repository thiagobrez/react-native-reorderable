# react-native-reorderable

Native reorder and drag-and-drop containers for React Native

## Installation

```sh
npm install react-native-reorderable
```


## Reordering one collection

The order is controlled by JavaScript. Apply `nextOrder` to your data when a move completes.

```tsx
import {
  ReorderableContainer,
  ReorderableItem,
} from 'react-native-reorderable';

<ReorderableContainer
  style={{ gap: 8 }}
  onMove={({ nextOrder }) => {
    setItems((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      return (nextOrder[0]?.itemIds ?? []).flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      });
    });
  }}
>
  {items.map((item) => (
    <ReorderableItem id={item.id} key={item.id} style={itemStyle}>
      <YourItem item={item} />
    </ReorderableItem>
  ))}
</ReorderableContainer>;
```

The container and items accept ordinary React Native `ViewProps`. There are no list, grid, column, color, or item-rendering props; row, column, wrapping, gaps, dimensions, alignment, and nested content are authored with normal React Native styles.

## Reordering between sections

```tsx
import {
  ReorderableContainer,
  ReorderableItem,
  ReorderableSection,
} from 'react-native-reorderable';

<ReorderableContainer onMove={applySectionOrder} style={containerStyle}>
  {sections.map((section) => (
    <ReorderableSection
      id={section.id}
      key={section.id}
      header={<SectionHeader section={section} />}
      style={sectionStyle}
    >
      {section.items.map((item) => (
        <ReorderableItem id={item.id} key={item.id} style={itemStyle}>
          <YourItem item={item} />
        </ReorderableItem>
      ))}
    </ReorderableSection>
  ))}
</ReorderableContainer>;
```

Item IDs must be non-empty and globally unique within a container. A reorder container contains either direct items or sections.

## Multi-item drag and drop

Selection is also controlled by JavaScript. Local drags transfer stable IDs; the library does not serialize application data or prescribe what a drop does.

```tsx
import {
  DragContainer,
  DraggableItem,
  DropZone,
} from 'react-native-reorderable';

<DragContainer
  selectedIds={selectedIds}
  onDrop={({ itemIds, destinationId }) => {
    moveItems(itemIds, destinationId);
    setSelectedIds([]);
  }}
  style={wrappedRowStyle}
>
  {items.map((item) => (
    <DraggableItem id={item.id} key={item.id} style={itemStyle}>
      <YourSelectableItem item={item} />
    </DraggableItem>
  ))}
  <DropZone id="archive" style={dropZoneStyle}>
    <YourDropZone />
  </DropZone>
</DragContainer>;
```

Use `isNativeReorderingAvailable` when an application needs to describe or disable the interaction on unsupported systems.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT
