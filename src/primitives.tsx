import {
  createRef,
  useEffect,
  useRef,
  type ReactElement,
  type RefAttributes,
} from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { Button, Platform, View } from 'react-native';

import NativeReorderableView, {
  type NativeDropEvent,
  type NativeMoveEvent,
} from './ReorderableView';
import { Commands } from './ReorderableViewNativeComponent';
import {
  fallbackSectionViewProps,
  mapNativeDropEvent,
  normalizeDragChildren,
  normalizeReorderableChildren,
  parseNativeIds,
  prepareNativeEntries,
} from './normalize';
import { reconcileReorder } from './semantic';
import { InteractionLifecycle } from './lifecycle';
import {
  FallbackReorderContainer,
  type FallbackTerminalEvent,
} from './fallback';
import type {
  DragContainerProps,
  DraggableItemProps,
  DropZoneProps,
  ReorderableContainerProps,
  ReorderDestination,
  ReorderableItemProps,
  ReorderableSectionProps,
} from './types';

type AcceptanceMove = Readonly<{
  sourceIds: readonly string[];
  destination: ReorderDestination;
}>;

type HostViewRef = React.ElementRef<typeof View>;
type ReorderableContainerComponentProps = ReorderableContainerProps &
  RefAttributes<HostViewRef>;
type ReorderableItemComponentProps = ReorderableItemProps &
  RefAttributes<HostViewRef>;
type ReorderableSectionComponentProps = ReorderableSectionProps &
  RefAttributes<HostViewRef>;

type InternalReorderableContainerProps = ReorderableContainerComponentProps & {
  debugAcceptanceMove?: AcceptanceMove;
  debugInteractionStateChange?: (active: boolean) => void;
};

function assignHostRef(ref: unknown, value: unknown): void {
  if (typeof ref === 'function') {
    (ref as (instance: unknown) => void)(value);
  } else if (ref != null && typeof ref === 'object' && 'current' in ref) {
    (ref as { current: unknown }).current = value;
  }
}

function platformMajorVersion(): number {
  const version =
    typeof Platform.Version === 'string'
      ? Number.parseInt(Platform.Version, 10)
      : Platform.Version;
  return Number.isFinite(version) ? version : 0;
}

function isNativeReorderingAvailable(): boolean {
  return Platform.OS === 'ios' && platformMajorVersion() >= 27;
}

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
  ref,
  ...viewProps
}: ReorderableItemComponentProps) {
  return (
    <View {...viewProps} ref={(value) => assignHostRef(ref, value)}>
      {children}
    </View>
  );
}

export function ReorderableSection(props: ReorderableSectionComponentProps) {
  const { ref, ...sectionProps } = props;
  return (
    <View
      {...fallbackSectionViewProps(sectionProps)}
      ref={(value) => assignHostRef(ref, value)}
    >
      {props.header}
      {props.children}
      {props.footer}
    </View>
  );
}

function ReorderableContainerImplementation({
  children,
  accessibilityStrings: _accessibilityStrings,
  enabled = true,
  engine = 'auto',
  onReorder,
  ref,
  selectedIds = [],
  debugAcceptanceMove,
  debugInteractionStateChange,
  ...viewProps
}: InternalReorderableContainerProps) {
  const fallbackLifecycle = useRef(new InteractionLifecycle()).current;
  useEffect(() => {
    if (!enabled) debugInteractionStateChange?.(false);
    return () => debugInteractionStateChange?.(false);
  }, [debugInteractionStateChange, enabled]);
  const nativeRef = createRef<React.ElementRef<typeof NativeReorderableView>>();
  const normalized = normalizeReorderableChildren(children, {
    Item: ReorderableItem,
    Section: ReorderableSection,
  });

  if (!enabled) {
    return (
      <View {...viewProps} ref={(value) => assignHostRef(ref, value)}>
        {children}
      </View>
    );
  }
  const commitTerminal = (
    sourceIdsJson: string,
    destinationCollectionId: string,
    destinationBeforeId: string
  ) => {
    const sourceIds = parseNativeIds(sourceIdsJson);
    const committedEvent = reconcileReorder(normalized.order, sourceIds, {
      sectionId: destinationCollectionId || null,
      beforeId: destinationBeforeId || null,
    });
    if (committedEvent != null) onReorder(committedEvent);
  };
  const handleFallbackInteractionStart = (interactionId: number) => {
    fallbackLifecycle.begin(interactionId);
  };
  const handleTerminal = (terminal: FallbackTerminalEvent) => {
    if (!fallbackLifecycle.finish(terminal.interactionId, terminal.outcome)) {
      return;
    }
    if (terminal.outcome === 'cancel') return;
    commitTerminal(
      terminal.sourceIdsJson,
      terminal.destinationCollectionId,
      terminal.destinationBeforeId
    );
  };
  if (engine === 'fallback' || !isNativeReorderingAvailable()) {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      throw new Error(
        `[react-native-reorderable] No reorder engine can fulfill the portable contract for this enabled ${Platform.OS} container.`
      );
    }
    return (
      <FallbackReorderContainer
        {...viewProps}
        collectionIds={normalized.collectionIds}
        debugAcceptanceMove={debugAcceptanceMove}
        entryIds={normalized.entryIds}
        entryKinds={normalized.entryKinds}
        forwardedRef={ref}
        onInteractionStart={handleFallbackInteractionStart}
        onInteractionStateChange={debugInteractionStateChange}
        onTerminal={handleTerminal}
        order={normalized.order}
        selectedIds={selectedIds}
      >
        {normalized.children}
      </FallbackReorderContainer>
    );
  }
  const nativeEntries = prepareNativeEntries(normalized);
  const currentItemIds = normalized.order.flatMap(
    (collection) => collection.itemIds
  );
  const selectedSet = new Set(selectedIds);
  const normalizedSelectedIds = currentItemIds.filter((id) =>
    selectedSet.has(id)
  );

  const handleMove = (event: NativeSyntheticEvent<NativeMoveEvent>) => {
    const { destinationBeforeId, destinationCollectionId, sourceIdsJson } =
      event.nativeEvent;
    commitTerminal(sourceIdsJson, destinationCollectionId, destinationBeforeId);
  };

  return (
    <>
      {debugAcceptanceMove == null ? null : (
        <>
          <Button
            accessibilityLabel="Activate native reorder"
            onPress={() => {
              if (nativeRef.current != null) {
                Commands.debugBeginInteraction(nativeRef.current);
              }
            }}
            title="Activate native reorder"
          />
          <Button
            accessibilityLabel="Apply native reorder"
            onPress={() => {
              if (nativeRef.current == null) return;
              Commands.debugEmitTerminalReorder(
                nativeRef.current,
                JSON.stringify(debugAcceptanceMove.sourceIds),
                debugAcceptanceMove.destination.sectionId ?? '',
                debugAcceptanceMove.destination.beforeId ?? ''
              );
            }}
            title="Apply native reorder"
          />
        </>
      )}
      <NativeReorderableView
        {...viewProps}
        collectionIds={nativeEntries.collectionIds}
        enabled={enabled}
        entryIds={nativeEntries.entryIds}
        entryKinds={nativeEntries.entryKinds}
        layoutRevision={layoutRevision(viewProps.style, nativeEntries.children)}
        mode="reorder"
        onMove={handleMove}
        onDebugInteractionStateChange={(event) =>
          debugInteractionStateChange?.(event.nativeEvent.active)
        }
        orderedEntryIds={nativeEntries.orderedEntryIds}
        ref={(value) => {
          nativeRef.current = value;
          assignHostRef(ref, value);
        }}
        selectedIds={normalizedSelectedIds}
      >
        {nativeEntries.children}
      </NativeReorderableView>
    </>
  );
}

export function ReorderableContainer(
  props: ReorderableContainerComponentProps
) {
  if (
    props.enabled !== false &&
    Platform.OS !== 'ios' &&
    Platform.OS !== 'android'
  ) {
    throw new Error(
      `[react-native-reorderable] No reorder engine can fulfill the portable contract for this enabled ${Platform.OS} container.`
    );
  }
  return ReorderableContainerImplementation(props);
}

/** @internal Debug-only acceptance harness; deliberately absent from index.tsx. */
export function NativeCommitAcceptanceContainer(
  props: ReorderableContainerComponentProps & {
    acceptanceMove: AcceptanceMove;
    onInteractionStateChange?: (active: boolean) => void;
  }
) {
  const { acceptanceMove, onInteractionStateChange, ...containerProps } = props;
  return (
    <ReorderableContainerImplementation
      {...containerProps}
      debugAcceptanceMove={acceptanceMove}
      debugInteractionStateChange={onInteractionStateChange}
    />
  );
}

/** @internal Debug-only acceptance harness; deliberately absent from index.tsx. */
export function FallbackCommitAcceptanceContainer(
  props: ReorderableContainerComponentProps & {
    acceptanceMove: AcceptanceMove;
    onInteractionStateChange?: (active: boolean) => void;
  }
) {
  const { acceptanceMove, onInteractionStateChange, ...containerProps } = props;
  return (
    <ReorderableContainerImplementation
      {...containerProps}
      debugAcceptanceMove={acceptanceMove}
      debugInteractionStateChange={onInteractionStateChange}
      engine="fallback"
    />
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

  if (!isNativeReorderingAvailable()) {
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
