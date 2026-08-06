# V1 public interface

This document freezes the public TypeScript interface of
`react-native-reorderable` v1. Application-rendered children, `data`, or
`sections` own durable order. Reorder and drop callbacks report committed
outcomes; neither is a proposal or veto hook.

## Root exports

The root entrypoint exports these runtime values:

```ts
export {
  DragDropContainer,
  DraggableItem,
  DropZone,
  ReorderableContainer,
  ReorderableItem,
  ReorderableSection,
  ReorderableList,
  ReorderableSectionList,
};
```

It exports these types:

```ts
export type {
  AccessibilityStrings,
  CollectionOrder,
  DragDropContainerProps,
  DraggableItemProps,
  DropAnnouncementContext,
  DropEvent,
  DropZoneProps,
  EnginePolicy,
  ReorderAnnouncementContext,
  ReorderDestination,
  ReorderEvent,
  ReorderableContainerProps,
  ReorderableItemLayout,
  ReorderableItemProps,
  ReorderableListProps,
  ReorderableListRenderItemInfo,
  ReorderableListSection,
  ReorderableSectionListProps,
  ReorderableSectionListRenderItemInfo,
  ReorderableSectionProps,
};
```

The root does not export a native-availability boolean, a capability object,
the resolved engine, native events, engine adapters, or reconciliation helpers.

## Shared value types

```ts
export type EnginePolicy = 'auto' | 'fallback';

export type ReorderDestination = Readonly<{
  sectionId: string | null;
  beforeId: string | null;
}>;

export type CollectionOrder = Readonly<{
  sectionId: string | null;
  itemIds: readonly string[];
}>;

export type ReorderEvent = Readonly<{
  sourceIds: readonly string[];
  destination: ReorderDestination;
  nextOrder: readonly CollectionOrder[];
}>;

export type DropEvent = Readonly<{
  itemIds: readonly string[];
  destinationId: string;
}>;

export type ReorderableItemLayout = Readonly<{
  index: number;
  length: number;
  offset: number;
}>;
```

`beforeId: null` means the end of the destination collection. An unsectioned
reorder uses one `CollectionOrder` whose `sectionId` is `null`. `sourceIds` and
`itemIds` are normalized into canonical pre-move collection and item order.

## Accessibility strings

```ts
export type ReorderAnnouncementContext = Readonly<{
  event: ReorderEvent;
  /** One-based position of the moved block. */
  position: number;
  /** Destination collection size after the commit. */
  collectionSize: number;
}>;

export type DropAnnouncementContext = Readonly<{
  event: DropEvent;
}>;

export type AccessibilityStrings = Readonly<{
  moveEarlierAction: string;
  moveLaterAction: string;
  dropSelectedItemsAction: string;
  reorderAnnouncement: (context: ReorderAnnouncementContext) => string;
  dropAnnouncement: (context: DropAnnouncementContext) => string;
  unavailableAnnouncement: string;
  orderCorrectedAnnouncement: string;
}>;
```

Every interactive container accepts
`accessibilityStrings?: Partial<AccessibilityStrings>`. Overrides merge with
these English defaults:

```ts
{
  moveEarlierAction: 'Move earlier',
  moveLaterAction: 'Move later',
  dropSelectedItemsAction: 'Drop selected items here',
  unavailableAnnouncement: 'This action is no longer available.',
  orderCorrectedAnnouncement: 'Order updated.',
  reorderAnnouncement: ({ event, position, collectionSize }) =>
    event.sourceIds.length === 1
      ? `Moved item to position ${position} of ${collectionSize}.`
      : `Moved ${event.sourceIds.length} items to position ${position} of ${collectionSize}.`,
  dropAnnouncement: ({ event }) =>
    event.itemIds.length === 1
      ? 'Dropped item.'
      : `Dropped ${event.itemIds.length} items.`,
}
```

Applications own meaningful accessibility labels on items, sections, and drop
zones, accessible selection controls, and any localization overrides. The
library owns semantic actions, positions, focus, and announcements and composes
its actions with app-authored React Native accessibility actions.

## Children-based reorder

```ts
export type ReorderableContainerProps = ViewProps & {
  children: ReactNode;
  accessibilityStrings?: Partial<AccessibilityStrings>;
  enabled?: boolean;
  engine?: EnginePolicy;
  onReorder: (event: ReorderEvent) => void;
  selectedIds?: readonly string[];
};

export type ReorderableItemProps = ViewProps & {
  children: ReactNode;
  id: string;
};

export type ReorderableSectionProps = ViewProps & {
  children: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  id: string;
};
```

`ReorderableContainer` contains either direct `ReorderableItem` children or
direct `ReorderableSection` children, never a mixture. Fragments are flattened.
A section directly contains only items; its header and footer are
non-reorderable. Invalid structure throws a descriptive error.

The children interface is for fully mounted, free-form layouts. It does not
promise auto-scroll for an arbitrary surrounding `ScrollView`.

## Drag-and-drop

```ts
export type DragDropContainerProps = ViewProps & {
  children: ReactNode;
  accessibilityStrings?: Partial<AccessibilityStrings>;
  enabled?: boolean;
  engine?: EnginePolicy;
  onDrop: (event: DropEvent) => void;
  selectedIds?: readonly string[];
};

export type DraggableItemProps = ViewProps & {
  children: ReactNode;
  id: string;
};

export type DropZoneProps = ViewProps & {
  children: ReactNode;
  id: string;
  canDrop?: (itemIds: readonly string[]) => boolean;
};
```

One `DragDropContainer` is one drag-and-drop scope. Its nested
`DraggableItem`s may drop on its nested `DropZone`s regardless of intervening
layout descendants. Separate scopes cannot exchange items.

`canDrop` defaults to accepting every nonempty known move set. For pointer
interaction, every zone is evaluated once when the move set activates and the
result is fixed for that drag. Accessible drop evaluates it when the action is
invoked. A throwing predicate cancels the interaction, emits no `DropEvent`,
and surfaces the application error. An accepted zone that unmounts before
release ceases to be a destination.

`DropEvent` is emitted exactly once after a drop commit. It contains no item
data, indices, engine identity, native event, or derived application order.

## Virtualized lists

```ts
export type ReorderableListRenderItemInfo<Item> = Readonly<{
  item: Item;
  index: number;
}>;

export type ReorderableSectionListRenderItemInfo<Item, Section> =
  ReorderableListRenderItemInfo<Item> &
  Readonly<{ section: Section }>;

export type ReorderableListSection<Item> = Readonly<{
  id: string;
  data: readonly Item[];
}>;
```

The library reserves these underlying-list props:

```ts
type OwnedListProp =
  | 'CellRendererComponent'
  | 'data'
  | 'getItemLayout'
  | 'horizontal'
  | 'inverted'
  | 'keyExtractor'
  | 'maintainVisibleContentPosition'
  | 'numColumns'
  | 'renderItem'
  | 'renderScrollComponent';
```

The default list props are structurally:

```ts
export type ReorderableListProps<Item> = Omit<
  FlatListProps<Item>,
  OwnedListProp
> & {
  data: readonly Item[];
  keyExtractor: (item: Item, index: number) => string;
  renderItem: (
    info: ReorderableListRenderItemInfo<Item>
  ) => ReactElement | null;
  onReorder: (event: ReorderEvent) => void;
  accessibilityStrings?: Partial<AccessibilityStrings>;
  enabled?: boolean;
  engine?: EnginePolicy;
  selectedIds?: readonly string[];
  getItemLayout?: (
    data: readonly Item[],
    index: number
  ) => ReorderableItemLayout;
  estimatedItemSize?: number;
};
```

The section-list props are structurally:

```ts
export type ReorderableSectionListProps<
  Item,
  Section extends ReorderableListSection<Item>,
> = Omit<
  SectionListProps<Item, Section>,
  OwnedListProp |
    'renderSectionFooter' |
    'renderSectionHeader' |
    'sections'
> & {
  sections: readonly Section[];
  keyExtractor: (
    item: Item,
    index: number,
    section: Section
  ) => string;
  renderItem: (
    info: ReorderableSectionListRenderItemInfo<Item, Section>
  ) => ReactElement | null;
  renderSectionHeader?: (
    info: Readonly<{ section: Section }>
  ) => ReactElement | null;
  renderSectionFooter?: (
    info: Readonly<{ section: Section }>
  ) => ReactElement | null;
  onReorder: (event: ReorderEvent) => void;
  accessibilityStrings?: Partial<AccessibilityStrings>;
  enabled?: boolean;
  engine?: EnginePolicy;
  selectedIds?: readonly string[];
  getItemLayout?: (
    sections: readonly Section[],
    sectionIndex: number,
    itemIndex: number
  ) => Omit<ReorderableItemLayout, 'index'>;
  estimatedItemSize?: number;
};
```

The wrappers forward every safe underlying-list prop and compose callbacks such
as `onScroll` with internal behavior. Passing a reserved unsupported prop from
untyped JavaScript or a spread throws descriptively. Horizontal, inverted, and
multi-column lists are unsupported in v1.

`getItemLayout` offsets are absolute from content start and include preceding
section chrome. Exact layouts win; otherwise measured layouts correct
`estimatedItemSize`. With neither hint, the library uses a private adaptive
estimate. Variable-height rows and empty sections remain supported.

The selected list implementation remains the viewport and retains its safe
props and typed imperative ref. Render callbacks never receive an imperative
`drag()` function.

## Optional list entrypoints

`react-native-reorderable/flash-list` exports:

```ts
export {
  ReorderableFlashList,
  ReorderableFlashSectionList,
};
export type {
  ReorderableFlashListProps,
  ReorderableFlashSectionListProps,
};
```

`react-native-reorderable/legend-list` exports:

```ts
export {
  ReorderableLegendList,
  ReorderableLegendSectionList,
};
export type {
  ReorderableLegendListProps,
  ReorderableLegendSectionListProps,
};
```

Each optional wrapper derives safe props and refs from its own list package but
replaces the same owned prop set with the portable interface above. Shared
types come from the root. The root does not import or re-export either optional
entrypoint, and v1 exposes no caller-authored adapter interface.

## Defaults, identity, and errors

- `engine` defaults to `'auto'` and may be forced to `'fallback'`.
- `enabled` defaults to `true`. Becoming false cancels an active interaction.
- `selectedIds` defaults to `[]`; duplicates and identities absent from current
  content are ignored.
- `accessibilityStrings` merges with the English defaults above.
- Headers, footers, geometry hints, and `canDrop` are absent by default.
- `onReorder` and `onDrop` are required.

Every identity is a nonempty string. Item identities are stable and globally
unique within a container, including across sections. Section identities are
unique among sections; drop-zone identities are unique among zones. Item,
section, and drop-zone identities occupy separate namespaces. Detectable empty
or duplicate identities throw descriptively in development and production. An
identity that becomes stale during an interaction follows the portable atomic
reconciliation rules instead: cancel silently and emit no outcome callback.

If `engine="auto"`, native reorder is preferred when available and fallback
reorder is selected otherwise. If no engine can fulfill the portable contract
while enabled, the container throws a descriptive configuration or runtime
error; it never becomes an inert view.

All children-based modules forward React Native `ViewProps` and host-view refs.
List modules retain their safe underlying props and typed refs.

## Deliberate exclusions

V1 exposes no:

- compatibility aliases for `DragContainer`, `onMove`, or `ReorderMove`;
- native availability, resolved-engine, or capability query;
- programmatic start, drive, or cancellation method;
- cancellation callback or public cancellation reason;
- mid-drag destination event;
- functional drag handle or activation-timing control;
- auto-scroll or haptic tuning;
- entry/exit animation feature or callback;
- generic list-adapter interface;
- horizontal, inverted, or multi-column list mode;
- cross-scope drag-and-drop; or
- interoperability or nesting between reorder items and draggable items.

Whole-item long press is the pointer activation model. Reorder items and
draggable items cannot nest because both claim that gesture. These exclusions
keep one honest portable interface across native and fallback reorder rather
than exposing fallback-only abilities.
