import type { ReactElement } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { Platform, View } from 'react-native';

import NativeReorderableView, {
  type NativeDropEvent,
  type NativeMoveEvent,
} from './ReorderableView';
import {
  applyMoveToOrder,
  fallbackSectionViewProps,
  mapNativeDropEvent,
  normalizeDragChildren,
  normalizeReorderableChildren,
  parseNativeIds,
  prepareNativeEntries,
} from './normalize';
import type {
  DragContainerProps,
  DraggableItemProps,
  DropZoneProps,
  ReorderableContainerProps,
  ReorderableItemProps,
  ReorderableSectionProps,
} from './types';

function platformMajorVersion(): number {
  const version =
    typeof Platform.Version === 'string'
      ? Number.parseInt(Platform.Version, 10)
      : Platform.Version;
  return Number.isFinite(version) ? version : 0;
}

export const isNativeReorderingAvailable =
  Platform.OS === 'ios' && platformMajorVersion() >= 27;

function layoutRevision(
  containerStyle: unknown,
  children: readonly ReactElement[]
): string {
  return JSON.stringify([
    containerStyle,
    ...children.map((child) => (child.props as { style?: unknown }).style),
  ]);
}

export function ReorderableItem({
  children,
  id: _id,
  ...viewProps
}: ReorderableItemProps) {
  return <View {...viewProps}>{children}</View>;
}

export function ReorderableSection(props: ReorderableSectionProps) {
  return (
    <View {...fallbackSectionViewProps(props)}>
      {props.header}
      {props.children}
    </View>
  );
}

export function ReorderableContainer({
  children,
  enabled = true,
  onMove,
  ...viewProps
}: ReorderableContainerProps) {
  const normalized = normalizeReorderableChildren(children, {
    Item: ReorderableItem,
    Section: ReorderableSection,
  });

  if (!isNativeReorderingAvailable) {
    return <View {...viewProps}>{children}</View>;
  }
  const nativeEntries = prepareNativeEntries(normalized);

  const handleMove = (event: NativeSyntheticEvent<NativeMoveEvent>) => {
    const { destinationBeforeId, destinationCollectionId, sourceIdsJson } =
      event.nativeEvent;
    const sourceIds = parseNativeIds(sourceIdsJson);
    const sectionId = destinationCollectionId || null;
    const beforeId = destinationBeforeId || null;
    onMove({
      sourceIds,
      destination: { sectionId, beforeId },
      nextOrder: applyMoveToOrder(
        normalized.order,
        sourceIds,
        sectionId,
        beforeId
      ),
    });
  };

  return (
    <NativeReorderableView
      {...viewProps}
      collectionIds={nativeEntries.collectionIds}
      enabled={enabled}
      entryIds={nativeEntries.entryIds}
      entryKinds={nativeEntries.entryKinds}
      layoutRevision={layoutRevision(viewProps.style, nativeEntries.children)}
      mode="reorder"
      onMove={handleMove}
      orderedEntryIds={nativeEntries.orderedEntryIds}
      selectedIds={[]}
    >
      {nativeEntries.children}
    </NativeReorderableView>
  );
}

export function DraggableItem({
  children,
  id: _id,
  ...viewProps
}: DraggableItemProps) {
  return <View {...viewProps}>{children}</View>;
}

export function DropZone({ children, id: _id, ...viewProps }: DropZoneProps) {
  return <View {...viewProps}>{children}</View>;
}

export function DragContainer({
  children,
  onDrop,
  selectedIds,
  ...viewProps
}: DragContainerProps) {
  const normalized = normalizeDragChildren(children, {
    DropZone,
    Item: DraggableItem,
  });

  if (!isNativeReorderingAvailable) {
    return <View {...viewProps}>{children}</View>;
  }
  const nativeEntries = prepareNativeEntries(normalized);
  const itemIds = new Set(
    normalized.entryIds.filter(
      (_id, index) => normalized.entryKinds[index] === 'item'
    )
  );

  const handleDrop = (event: NativeSyntheticEvent<NativeDropEvent>) => {
    onDrop(
      mapNativeDropEvent(
        event.nativeEvent.itemIdsJson,
        event.nativeEvent.destinationId
      )
    );
  };

  return (
    <NativeReorderableView
      {...viewProps}
      collectionIds={nativeEntries.collectionIds}
      enabled
      entryIds={nativeEntries.entryIds}
      entryKinds={nativeEntries.entryKinds}
      layoutRevision={layoutRevision(viewProps.style, nativeEntries.children)}
      mode="dragDrop"
      onDrop={handleDrop}
      orderedEntryIds={nativeEntries.orderedEntryIds}
      selectedIds={selectedIds.filter((id) => itemIds.has(id))}
    >
      {nativeEntries.children}
    </NativeReorderableView>
  );
}
