import type { ReactNode } from 'react';
import type { ViewProps } from 'react-native';

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

export type DragContainerProps = ViewProps & {
  children: ReactNode;
  onDrop: (event: DropEvent) => void;
  selectedIds: readonly string[];
};

export type DraggableItemProps = ViewProps & {
  children: ReactNode;
  id: string;
};

export type DropZoneProps = ViewProps & {
  children: ReactNode;
  id: string;
};
