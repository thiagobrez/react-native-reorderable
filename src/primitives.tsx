import {
  Children,
  createRef,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
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
  DragDropContainerProps,
  DraggableItemProps,
  DropEvent,
  DropZoneProps,
  ReorderableContainerProps,
  ReorderDestination,
  ReorderableItemProps,
  ReorderableSectionProps,
} from './types';
import { FallbackDropContainer } from './fallback-drop';
import { reconcileDrop } from './semantic';

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

function containsComponent(
  children: ReactNode,
  types: readonly unknown[]
): boolean {
  return Children.toArray(children).some((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return false;
    return (
      types.includes(child.type) ||
      containsComponent(child.props.children, types)
    );
  });
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
  if (
    containsComponent(children, [DragDropContainer, DraggableItem, DropZone])
  ) {
    throw new Error(
      '[react-native-reorderable] Reorderable and drag-and-drop interfaces cannot nest or interoperate.'
    );
  }
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
        acceptedDropZoneIds={[]}
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
        parentEntryIds={nativeEntries.parentEntryIds}
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

type InternalDragDropContainerProps = DragDropContainerProps & {
  debugAcceptanceMove?: Readonly<{ sourceId: string; destinationId: string }>;
  debugInteractionStateChange?: (active: boolean) => void;
};

function DragDropContainerImplementation({
  children,
  accessibilityStrings: _accessibilityStrings,
  enabled = true,
  engine = 'auto',
  onDrop,
  selectedIds = [],
  debugAcceptanceMove,
  debugInteractionStateChange,
  ...viewProps
}: InternalDragDropContainerProps) {
  if (
    containsComponent(children, [
      DragDropContainer,
      ReorderableContainer,
      ReorderableItem,
      ReorderableSection,
    ])
  ) {
    throw new Error(
      '[react-native-reorderable] Drag-and-drop roots cannot nest, and reorderable and draggable interfaces cannot interoperate.'
    );
  }
  const [acceptedDropZoneIds, setAcceptedDropZoneIds] = useState<
    readonly string[]
  >([]);
  const activeAcceptanceRef = useRef<ReadonlySet<string> | null>(null);
  const pendingNativeDropRef = useRef<DropEvent | null>(null);
  const nativeActivationPhaseRef = useRef<'idle' | 'evaluating' | 'ready'>(
    'idle'
  );
  const nativeRef = createRef<React.ElementRef<typeof NativeReorderableView>>();
  const normalized = normalizeDragChildren(children, {
    DropZone,
    Item: DraggableItem,
  });
  const itemIds = normalized.entryIds.filter(
    (_id, index) => normalized.entryKinds[index] === 'item'
  );
  const zoneIds = normalized.entryIds.filter(
    (_id, index) => normalized.entryKinds[index] === 'dropZone'
  );
  const selectedSet = new Set(selectedIds);
  const normalizedSelectedIds = itemIds.filter((id) => selectedSet.has(id));
  const mountedAcceptedDropZoneIds = acceptedDropZoneIds.filter((id) =>
    zoneIds.includes(id)
  );
  const commitDrop = (
    terminalItemIds: readonly string[],
    destinationId: string,
    accepted: boolean
  ) => {
    const event = reconcileDrop(
      itemIds,
      terminalItemIds,
      zoneIds,
      destinationId,
      accepted
    );
    if (event != null) onDrop(event);
  };

  if (!enabled) return <View {...viewProps}>{children}</View>;

  if (engine === 'fallback' || !isNativeReorderingAvailable()) {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      throw new Error(
        `[react-native-reorderable] No drag-and-drop engine can fulfill the portable contract for this enabled ${Platform.OS} container.`
      );
    }
    return (
      <FallbackDropContainer
        {...viewProps}
        canDropById={normalized.canDropById}
        debugMove={debugAcceptanceMove}
        entryIds={normalized.entryIds}
        entryKinds={normalized.entryKinds}
        parentEntryIds={normalized.parentEntryIds}
        selectedIds={selectedIds}
        onDropTerminal={(terminal) => {
          if (terminal != null) {
            commitDrop(
              terminal.itemIds,
              terminal.destinationId,
              terminal.accepted
            );
          }
        }}
      >
        {normalized.children}
      </FallbackDropContainer>
    );
  }
  const nativeEntries = prepareNativeEntries(normalized);
  const finishNativeDrop = (mapped: DropEvent) => {
    if (nativeActivationPhaseRef.current === 'idle') return;
    const acceptance = activeAcceptanceRef.current;
    if (
      nativeActivationPhaseRef.current === 'evaluating' ||
      acceptance == null
    ) {
      pendingNativeDropRef.current = mapped;
      return;
    }
    commitDrop(
      mapped.itemIds,
      mapped.destinationId,
      acceptance.has(mapped.destinationId)
    );
    pendingNativeDropRef.current = null;
    activeAcceptanceRef.current = null;
    nativeActivationPhaseRef.current = 'idle';
    setAcceptedDropZoneIds([]);
  };

  const handleDrop = (event: NativeSyntheticEvent<NativeDropEvent>) => {
    finishNativeDrop(
      mapNativeDropEvent(
        event.nativeEvent.itemIdsJson,
        event.nativeEvent.destinationId
      )
    );
  };

  const handleDragActivate = (
    event: NativeSyntheticEvent<{ itemIdsJson: string }>
  ) => {
    nativeActivationPhaseRef.current = 'evaluating';
    activeAcceptanceRef.current = null;
    setAcceptedDropZoneIds([]);
    const activeIds = mapNativeDropEvent(
      event.nativeEvent.itemIdsJson,
      ''
    ).itemIds;
    let accepted: readonly string[];
    try {
      accepted = zoneIds.filter((zoneId) => {
        const predicate = normalized.canDropById.get(zoneId);
        return (predicate ?? ((ids: readonly string[]) => ids.length > 0))(
          activeIds
        );
      });
    } catch (error) {
      pendingNativeDropRef.current = null;
      nativeActivationPhaseRef.current = 'idle';
      if (nativeRef.current != null) {
        Commands.cancelInteraction(nativeRef.current);
      }
      throw error;
    }
    activeAcceptanceRef.current = new Set(accepted);
    nativeActivationPhaseRef.current = 'ready';
    setAcceptedDropZoneIds(accepted);
    if (pendingNativeDropRef.current != null) {
      const pendingDrop = pendingNativeDropRef.current;
      pendingNativeDropRef.current = null;
      finishNativeDrop(pendingDrop);
    }
  };

  const handleNativeInteractionState = (
    event: NativeSyntheticEvent<{ active: boolean }>
  ) => {
    debugInteractionStateChange?.(event.nativeEvent.active);
    if (event.nativeEvent.active) return;
    pendingNativeDropRef.current = null;
    activeAcceptanceRef.current = null;
    nativeActivationPhaseRef.current = 'idle';
    setAcceptedDropZoneIds([]);
  };

  return (
    <>
      {debugAcceptanceMove == null ? null : (
        <>
          <Button
            accessibilityLabel="Activate native drop"
            onPress={() => {
              if (nativeRef.current != null) {
                Commands.debugBeginDrop(
                  nativeRef.current,
                  debugAcceptanceMove.sourceId
                );
              }
            }}
            title="Activate native drop"
          />
          <Button
            accessibilityLabel="Move native drop destination"
            onPress={() => {
              if (nativeRef.current != null) {
                Commands.debugTargetDrop(
                  nativeRef.current,
                  debugAcceptanceMove.destinationId
                );
              }
            }}
            title="Move native drop destination"
          />
          <Button
            accessibilityLabel="Commit native drop"
            onPress={() => {
              if (nativeRef.current != null) {
                Commands.debugEmitTerminalDrop(nativeRef.current, false);
              }
            }}
            title="Commit native drop"
          />
          <Button
            accessibilityLabel="Release native drop outside"
            onPress={() => {
              if (nativeRef.current != null) {
                Commands.debugEmitTerminalDrop(nativeRef.current, true);
              }
            }}
            title="Release native drop outside"
          />
        </>
      )}
      <NativeReorderableView
        {...viewProps}
        acceptedDropZoneIds={mountedAcceptedDropZoneIds}
        collectionIds={nativeEntries.collectionIds}
        enabled
        entryIds={nativeEntries.entryIds}
        entryKinds={nativeEntries.entryKinds}
        layoutRevision={layoutRevision(viewProps.style, nativeEntries.children)}
        mode="dragDrop"
        onDragActivate={handleDragActivate}
        onDebugInteractionStateChange={handleNativeInteractionState}
        onDrop={handleDrop}
        orderedEntryIds={nativeEntries.orderedEntryIds}
        parentEntryIds={nativeEntries.parentEntryIds}
        ref={nativeRef}
        selectedIds={normalizedSelectedIds}
      >
        {nativeEntries.children}
      </NativeReorderableView>
    </>
  );
}

export function DragDropContainer(props: DragDropContainerProps) {
  return DragDropContainerImplementation(props);
}

/** @internal Device acceptance harness; deliberately absent from index.tsx. */
export function FallbackDropAcceptanceContainer(
  props: DragDropContainerProps & {
    acceptanceMove: Readonly<{ sourceId: string; destinationId: string }>;
  }
) {
  const { acceptanceMove, ...containerProps } = props;
  return (
    <DragDropContainerImplementation
      {...containerProps}
      debugAcceptanceMove={acceptanceMove}
      engine="fallback"
    />
  );
}

/** @internal Device acceptance harness; deliberately absent from index.tsx. */
export function NativeDropAcceptanceContainer(
  props: DragDropContainerProps & {
    acceptanceMove: Readonly<{ sourceId: string; destinationId: string }>;
    interactionStateChange?: (active: boolean) => void;
  }
) {
  const { acceptanceMove, interactionStateChange, ...containerProps } = props;
  return (
    <DragDropContainerImplementation
      {...containerProps}
      debugAcceptanceMove={acceptanceMove}
      debugInteractionStateChange={interactionStateChange}
    />
  );
}
