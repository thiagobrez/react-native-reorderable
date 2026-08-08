import type { ReactElement, ReactNode } from 'react';
import type { FlatListProps, ViewProps } from 'react-native';

export type CollectionOrder = Readonly<{
  sectionId: string | null;
  itemIds: readonly string[];
}>;

export type EnginePolicy = 'auto' | 'fallback';

export type ReorderDestination = Readonly<{
  sectionId: string | null;
  beforeId: string | null;
}>;

export type ReorderEvent = Readonly<{
  sourceIds: readonly string[];
  destination: ReorderDestination;
  nextOrder: readonly CollectionOrder[];
}>;

export type ReorderAnnouncementContext = Readonly<{
  event: ReorderEvent;
  position: number;
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

export type DropEvent = Readonly<{
  itemIds: readonly string[];
  destinationId: string;
}>;

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

export type ReorderableItemLayout = Readonly<{
  index: number;
  length: number;
  offset: number;
}>;

export type ReorderableListRenderItemInfo<Item> = Readonly<{
  item: Item;
  index: number;
}>;

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
