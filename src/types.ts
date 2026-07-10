import type { ReactNode } from 'react';
import type { ViewProps } from 'react-native';

export type CollectionOrder = Readonly<{
  sectionId: string | null;
  itemIds: readonly string[];
}>;

export type ReorderMove = Readonly<{
  sourceIds: readonly string[];
  destination: Readonly<{
    sectionId: string | null;
    beforeId: string | null;
  }>;
  nextOrder: readonly CollectionOrder[];
}>;

export type DropEvent = Readonly<{
  itemIds: readonly string[];
  destinationId: string;
}>;

export type ReorderableContainerProps = ViewProps & {
  children: ReactNode;
  enabled?: boolean;
  onMove: (move: ReorderMove) => void;
};

export type ReorderableItemProps = ViewProps & {
  children: ReactNode;
  id: string;
};

export type ReorderableSectionProps = ViewProps & {
  children: ReactNode;
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
