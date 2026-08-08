import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
} from 'react';
import type {
  AccessibilityActionEvent,
  NativeSyntheticEvent,
  ViewProps,
} from 'react-native';
import {
  AccessibilityInfo,
  Button,
  findNodeHandle,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

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
import {
  accessibleReorderMove,
  canonicalDropSelection,
  reconcileReorder,
} from './semantic';
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
import {
  collectionOrderSignature,
  resolveAccessibilityStrings,
} from './accessibility';

type AcceptanceMove = Readonly<{
  sourceIds: readonly string[];
  destination: ReorderDestination;
}>;

export type SemanticActionRequest = Readonly<{
  actionLabel: string;
  itemLabel: string;
  nonce: number;
}>;

type HostViewRef = React.ElementRef<typeof View>;
type AndroidCollectionItemProps = Readonly<{
  accessibilityCollectionItem?: Readonly<{
    columnIndex: number;
    columnSpan: number;
    heading: boolean;
    itemIndex: number;
    rowIndex: number;
    rowSpan: number;
  }>;
}>;
type ReorderableContainerComponentProps = ReorderableContainerProps &
  RefAttributes<HostViewRef>;
type ReorderableItemComponentProps = ReorderableItemProps &
  RefAttributes<HostViewRef>;
type ReorderableSectionComponentProps = ReorderableSectionProps &
  RefAttributes<HostViewRef>;

type InternalReorderableContainerProps = ReorderableContainerComponentProps & {
  debugAcceptanceMove?: AcceptanceMove;
  debugAccessibilityAction?: SemanticActionRequest | null;
  debugAccessibilityContainerId?: string;
  debugInteractionStateChange?: (active: boolean) => void;
};

function acceptsDrop(
  predicate: ((itemIds: readonly string[]) => boolean) | undefined,
  itemIds: readonly string[]
): boolean {
  return predicate == null ? itemIds.length > 0 : predicate(itemIds);
}

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

function uniqueAccessibilityActionName(
  baseName: string,
  appActions: NonNullable<ViewProps['accessibilityActions']>
): string {
  const appNames = new Set(appActions.map((action) => action.name));
  let name = baseName;
  let suffix = 1;
  while (appNames.has(name)) {
    name = `${baseName}.${suffix}`;
    suffix += 1;
  }
  return name;
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
  accessibilityStrings,
  enabled = true,
  engine = 'auto',
  onReorder,
  ref,
  selectedIds = [],
  debugAcceptanceMove,
  debugAccessibilityAction,
  debugAccessibilityContainerId,
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
  const nativeRef =
    useRef<React.ElementRef<typeof NativeReorderableView>>(null);
  const debugAccessibilityBridgeRef =
    useRef<React.ElementRef<typeof NativeReorderableView>>(null);
  const normalized = normalizeReorderableChildren(children, {
    Item: ReorderableItem,
    Section: ReorderableSection,
  });
  const currentOrderRef = useRef(normalized.order);
  currentOrderRef.current = normalized.order;
  const currentItemIds = normalized.order.flatMap(
    (collection) => collection.itemIds
  );
  const selectedSet = new Set(selectedIds);
  const normalizedSelectedIds = currentItemIds.filter((id) =>
    selectedSet.has(id)
  );
  const semanticActionSignature = JSON.stringify([
    enabled,
    normalized.order,
    normalizedSelectedIds,
  ]);
  const currentSemanticActionSignatureRef = useRef(semanticActionSignature);
  currentSemanticActionSignatureRef.current = semanticActionSignature;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const resolvedAccessibilityStrings =
    resolveAccessibilityStrings(accessibilityStrings);
  const accessibilityStringsRef = useRef(resolvedAccessibilityStrings);
  accessibilityStringsRef.current = resolvedAccessibilityStrings;
  const accessibleItemRefs = useRef(new Map<string, unknown>());
  const pendingAccessibleOrder = useRef<string | null>(null);
  const currentOrderSignature = collectionOrderSignature(normalized.order);
  const currentOrderSignatureRef = useRef(currentOrderSignature);
  currentOrderSignatureRef.current = currentOrderSignature;

  const focusAccessibleItem = (id: string) => {
    setTimeout(() => {
      const tag = findNodeHandle(accessibleItemRefs.current.get(id));
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag);
    }, 0);
  };

  const settlePendingAccessibleOrder = () => {
    const expectedOrder = pendingAccessibleOrder.current;
    if (expectedOrder == null) return;
    pendingAccessibleOrder.current = null;
    if (expectedOrder !== currentOrderSignatureRef.current) {
      AccessibilityInfo.announceForAccessibility(
        accessibilityStringsRef.current.orderCorrectedAnnouncement
      );
    }
  };

  useEffect(settlePendingAccessibleOrder);

  const handleAccessibleMove = (
    activatedId: string,
    move: NonNullable<ReturnType<typeof accessibleReorderMove>>,
    activationSignature: string
  ) => {
    if (activationSignature !== currentSemanticActionSignatureRef.current) {
      AccessibilityInfo.announceForAccessibility(
        accessibilityStringsRef.current.unavailableAnnouncement
      );
      focusAccessibleItem(activatedId);
      return;
    }
    const committedEvent = reconcileReorder(
      currentOrderRef.current,
      move.sourceIds,
      move.destination
    );
    if (committedEvent == null) {
      AccessibilityInfo.announceForAccessibility(
        accessibilityStringsRef.current.unavailableAnnouncement
      );
      focusAccessibleItem(activatedId);
      return;
    }
    pendingAccessibleOrder.current = collectionOrderSignature(
      committedEvent.nextOrder
    );
    onReorderRef.current(committedEvent);
    const destinationCollection = committedEvent.nextOrder.find(
      (collection) =>
        collection.sectionId === committedEvent.destination.sectionId
    )!;
    AccessibilityInfo.announceForAccessibility(
      accessibilityStringsRef.current.reorderAnnouncement({
        event: committedEvent,
        position:
          destinationCollection.itemIds.indexOf(committedEvent.sourceIds[0]!) +
          1,
        collectionSize: destinationCollection.itemIds.length,
      })
    );
    focusAccessibleItem(activatedId);
  };

  const accessibleChildren = normalized.children.map((child, index) => {
    if (normalized.entryKinds[index] !== 'item') return child;
    const id = normalized.entryIds[index]!;
    const earlier = accessibleReorderMove(
      normalized.order,
      id,
      selectedIds,
      'earlier'
    );
    const later = accessibleReorderMove(
      normalized.order,
      id,
      selectedIds,
      'later'
    );
    const accessibleChild = child as ReactElement<
      ViewProps & AndroidCollectionItemProps & RefAttributes<unknown>
    >;
    const childProps = accessibleChild.props;
    const appActions = childProps.accessibilityActions ?? [];
    const earlierActionName = uniqueAccessibilityActionName(
      'reorder-move-earlier',
      appActions
    );
    const laterActionName = uniqueAccessibilityActionName(
      'reorder-move-later',
      appActions
    );
    const collection = normalized.order.find((candidate) =>
      candidate.itemIds.includes(id)
    )!;
    const collectionIndex = normalized.order.indexOf(collection);
    const position = collection.itemIds.indexOf(id) + 1;
    const libraryActions: NonNullable<
      ViewProps['accessibilityActions']
    >[number][] = [];
    if (earlier != null) {
      libraryActions.push({
        name: earlierActionName,
        label: resolvedAccessibilityStrings.moveEarlierAction,
      });
    }
    if (later != null) {
      libraryActions.push({
        name: laterActionName,
        label: resolvedAccessibilityStrings.moveLaterAction,
      });
    }
    const onAppAccessibilityAction = childProps.onAccessibilityAction;
    const appRef = childProps.ref;
    return cloneElement(accessibleChild, {
      accessible: childProps.accessible ?? true,
      accessibilityActions: [...appActions, ...libraryActions],
      accessibilityValue: {
        max: collection.itemIds.length,
        min: 1,
        now: position,
      },
      ...(Platform.OS === 'android'
        ? {
            accessibilityCollectionItem: {
              columnIndex: collectionIndex,
              columnSpan: 1,
              heading: false,
              itemIndex: position - 1,
              rowIndex: position - 1,
              rowSpan: 1,
            },
          }
        : {}),
      onAccessibilityAction: (event: AccessibilityActionEvent) => {
        const actionName = event.nativeEvent.actionName;
        if (actionName === earlierActionName) {
          if (earlier != null) {
            handleAccessibleMove(id, earlier, semanticActionSignature);
          } else {
            AccessibilityInfo.announceForAccessibility(
              accessibilityStringsRef.current.unavailableAnnouncement
            );
            focusAccessibleItem(id);
          }
        } else if (actionName === laterActionName) {
          if (later != null) {
            handleAccessibleMove(id, later, semanticActionSignature);
          } else {
            AccessibilityInfo.announceForAccessibility(
              accessibilityStringsRef.current.unavailableAnnouncement
            );
            focusAccessibleItem(id);
          }
        } else {
          onAppAccessibilityAction?.(event);
        }
      },
      ref: (value: unknown) => {
        assignHostRef(appRef, value);
        if (value == null) accessibleItemRefs.current.delete(id);
        else accessibleItemRefs.current.set(id, value);
      },
    });
  });

  useEffect(() => {
    if (debugAccessibilityAction == null) return;
    const target = nativeRef.current ?? debugAccessibilityBridgeRef.current;
    if (target == null) return;
    Commands.debugPerformAccessibilityAction(
      target,
      debugAccessibilityAction.itemLabel,
      debugAccessibilityAction.actionLabel
    );
  }, [debugAccessibilityAction]);

  const debugAccessibilityBridge =
    debugAccessibilityAction === undefined ? null : (
      <NativeReorderableView
        acceptedDropZoneIds={[]}
        collectionIds={[]}
        debugAccessibilityContainerId={debugAccessibilityContainerId}
        enabled={false}
        entryIds={[]}
        entryKinds={[]}
        layoutRevision="accessibility-action-bridge"
        mode="reorder"
        orderedEntryIds={[]}
        parentEntryIds={[]}
        ref={debugAccessibilityBridgeRef}
        selectedIds={[]}
        style={debugStyles.accessibilityActionBridge}
      />
    );

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
      <>
        {debugAccessibilityBridge}
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
          {accessibleChildren}
        </FallbackReorderContainer>
      </>
    );
  }
  const nativeEntries = prepareNativeEntries({
    ...normalized,
    children: accessibleChildren,
  });
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
        debugAccessibilityContainerId={debugAccessibilityContainerId}
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

const debugStyles = StyleSheet.create({
  accessibilityActionBridge: {
    height: 1,
    opacity: 0,
    position: 'absolute',
    width: 1,
  },
});

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
    actionRequest?: SemanticActionRequest | null;
    actionContainerId?: string;
    onInteractionStateChange?: (active: boolean) => void;
  }
) {
  const {
    acceptanceMove,
    actionRequest,
    actionContainerId,
    onInteractionStateChange,
    ...containerProps
  } = props;
  return (
    <ReorderableContainerImplementation
      {...containerProps}
      debugAcceptanceMove={acceptanceMove}
      debugAccessibilityAction={actionRequest}
      debugAccessibilityContainerId={actionContainerId}
      debugInteractionStateChange={onInteractionStateChange}
    />
  );
}

/** @internal Debug-only acceptance harness; deliberately absent from index.tsx. */
export function FallbackCommitAcceptanceContainer(
  props: ReorderableContainerComponentProps & {
    acceptanceMove: AcceptanceMove;
    actionRequest?: SemanticActionRequest | null;
    actionContainerId?: string;
    onInteractionStateChange?: (active: boolean) => void;
  }
) {
  const {
    acceptanceMove,
    actionRequest,
    actionContainerId,
    onInteractionStateChange,
    ...containerProps
  } = props;
  return (
    <ReorderableContainerImplementation
      {...containerProps}
      debugAcceptanceMove={acceptanceMove}
      debugAccessibilityAction={actionRequest}
      debugAccessibilityContainerId={actionContainerId}
      debugInteractionStateChange={onInteractionStateChange}
      engine="fallback"
    />
  );
}

/** @internal DEBUG harness that asks native accessibility to invoke a real item action. */
export function SemanticActionAcceptanceContainer(
  props: ReorderableContainerComponentProps & {
    actionRequest: SemanticActionRequest | null;
    actionContainerId: string;
  }
) {
  const { actionContainerId, actionRequest, ...containerProps } = props;
  return (
    <ReorderableContainerImplementation
      {...containerProps}
      debugAccessibilityAction={actionRequest}
      debugAccessibilityContainerId={actionContainerId}
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
  debugAccessibilityAction?: SemanticActionRequest | null;
  debugAccessibilityContainerId?: string;
  debugInteractionStateChange?: (active: boolean) => void;
};

function DragDropContainerImplementation({
  children,
  accessibilityStrings,
  enabled = true,
  engine = 'auto',
  onDrop,
  selectedIds = [],
  debugAcceptanceMove,
  debugAccessibilityAction,
  debugAccessibilityContainerId,
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
  const nativeRef =
    useRef<React.ElementRef<typeof NativeReorderableView>>(null);
  const debugAccessibilityBridgeRef =
    useRef<React.ElementRef<typeof NativeReorderableView>>(null);
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
  const accessibleSelectionSignature = JSON.stringify(normalizedSelectedIds);
  const accessibleAcceptanceByZone = useMemo(() => {
    const acceptance = new Map<string, boolean>();
    for (const zoneId of zoneIds) {
      if (!enabled || normalizedSelectedIds.length === 0) {
        acceptance.set(zoneId, false);
        continue;
      }
      acceptance.set(
        zoneId,
        acceptsDrop(normalized.canDropById.get(zoneId), normalizedSelectedIds)
      );
    }
    return acceptance;
    // Internal interaction-state renders retain the same children. Application
    // rerenders provide a new tree and must refresh current action availability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessibleSelectionSignature, children, enabled]);
  const currentAccessibleDropStateRef = useRef({
    canDropById: normalized.canDropById,
    enabled,
    itemIds,
    selectedIds: normalizedSelectedIds,
    zoneIds,
  });
  currentAccessibleDropStateRef.current = {
    canDropById: normalized.canDropById,
    enabled,
    itemIds,
    selectedIds: normalizedSelectedIds,
    zoneIds,
  };
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const resolvedAccessibilityStrings =
    resolveAccessibilityStrings(accessibilityStrings);
  const accessibilityStringsRef = useRef(resolvedAccessibilityStrings);
  accessibilityStringsRef.current = resolvedAccessibilityStrings;
  const accessibleZoneRefs = useRef(new Map<string, unknown>());
  const focusAccessibleZone = (id: string) => {
    setTimeout(() => {
      const tag = findNodeHandle(accessibleZoneRefs.current.get(id));
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag);
    }, 0);
  };
  const settleUnavailableDrop = (id: string) => {
    AccessibilityInfo.announceForAccessibility(
      accessibilityStringsRef.current.unavailableAnnouncement
    );
    focusAccessibleZone(id);
  };
  const handleAccessibleDrop = (destinationId: string) => {
    const current = currentAccessibleDropStateRef.current;
    const currentSelection = canonicalDropSelection(
      current.itemIds,
      current.selectedIds
    );
    if (
      !current.enabled ||
      currentSelection.length === 0 ||
      !current.zoneIds.includes(destinationId)
    ) {
      settleUnavailableDrop(destinationId);
      return;
    }
    const accepted = acceptsDrop(
      current.canDropById.get(destinationId),
      currentSelection
    );
    if (!accepted) {
      settleUnavailableDrop(destinationId);
      return;
    }
    const event = reconcileDrop(
      current.itemIds,
      currentSelection,
      current.zoneIds,
      destinationId,
      true
    );
    if (event == null) {
      settleUnavailableDrop(destinationId);
      return;
    }
    onDropRef.current(event);
    AccessibilityInfo.announceForAccessibility(
      accessibilityStringsRef.current.dropAnnouncement({ event })
    );
    focusAccessibleZone(destinationId);
  };
  const accessibleChildren = normalized.children.map((child, index) => {
    if (normalized.entryKinds[index] !== 'dropZone') return child;
    const id = normalized.entryIds[index]!;
    const accessibleChild = child as ReactElement<
      ViewProps & RefAttributes<unknown>
    >;
    const childProps = accessibleChild.props;
    const appActions = childProps.accessibilityActions ?? [];
    const actionName = uniqueAccessibilityActionName(
      'drag-drop-drop-selected',
      appActions
    );
    const accepted = accessibleAcceptanceByZone.get(id) === true;
    const libraryActions: NonNullable<ViewProps['accessibilityActions']> =
      accepted
        ? [
            {
              name: actionName,
              label: resolvedAccessibilityStrings.dropSelectedItemsAction,
            },
          ]
        : [];
    const onAppAccessibilityAction = childProps.onAccessibilityAction;
    const appRef = childProps.ref;
    return cloneElement(accessibleChild, {
      accessible: childProps.accessible ?? true,
      accessibilityActions: [...appActions, ...libraryActions],
      onAccessibilityAction: (event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === actionName && accepted) {
          handleAccessibleDrop(id);
        } else {
          onAppAccessibilityAction?.(event);
        }
      },
      ref: (value: unknown) => {
        assignHostRef(appRef, value);
        if (value == null) accessibleZoneRefs.current.delete(id);
        else accessibleZoneRefs.current.set(id, value);
      },
    });
  });
  useEffect(() => {
    if (debugAccessibilityAction == null) return;
    const target = nativeRef.current ?? debugAccessibilityBridgeRef.current;
    if (target == null) return;
    Commands.debugPerformAccessibilityAction(
      target,
      debugAccessibilityAction.itemLabel,
      debugAccessibilityAction.actionLabel
    );
  }, [debugAccessibilityAction]);
  const debugAccessibilityBridge =
    debugAccessibilityAction === undefined ? null : (
      <NativeReorderableView
        acceptedDropZoneIds={[]}
        collectionIds={[]}
        debugAccessibilityContainerId={debugAccessibilityContainerId}
        enabled={false}
        entryIds={[]}
        entryKinds={[]}
        layoutRevision="drop-accessibility-action-bridge"
        mode="dragDrop"
        orderedEntryIds={[]}
        parentEntryIds={[]}
        ref={debugAccessibilityBridgeRef}
        selectedIds={[]}
        style={debugStyles.accessibilityActionBridge}
      />
    );
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
      <>
        {debugAccessibilityBridge}
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
          {accessibleChildren}
        </FallbackDropContainer>
      </>
    );
  }
  const nativeEntries = prepareNativeEntries({
    ...normalized,
    children: accessibleChildren,
  });
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
        return acceptsDrop(normalized.canDropById.get(zoneId), activeIds);
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
        debugAccessibilityContainerId={debugAccessibilityContainerId}
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
    actionContainerId?: string;
    actionRequest?: SemanticActionRequest | null;
  }
) {
  const {
    acceptanceMove,
    actionContainerId,
    actionRequest,
    ...containerProps
  } = props;
  return (
    <DragDropContainerImplementation
      {...containerProps}
      debugAcceptanceMove={acceptanceMove}
      debugAccessibilityAction={actionRequest}
      debugAccessibilityContainerId={actionContainerId}
      engine="fallback"
    />
  );
}

/** @internal Device acceptance harness; deliberately absent from index.tsx. */
export function NativeDropAcceptanceContainer(
  props: DragDropContainerProps & {
    acceptanceMove: Readonly<{ sourceId: string; destinationId: string }>;
    actionContainerId?: string;
    actionRequest?: SemanticActionRequest | null;
    interactionStateChange?: (active: boolean) => void;
  }
) {
  const {
    acceptanceMove,
    actionContainerId,
    actionRequest,
    interactionStateChange,
    ...containerProps
  } = props;
  return (
    <DragDropContainerImplementation
      {...containerProps}
      debugAcceptanceMove={acceptanceMove}
      debugAccessibilityAction={actionRequest}
      debugAccessibilityContainerId={actionContainerId}
      debugInteractionStateChange={interactionStateChange}
    />
  );
}
