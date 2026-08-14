import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactElement,
  type Ref,
} from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  measure,
  useAnimatedRef,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import {
  AppState,
  BackHandler,
  Button,
  Platform,
  StyleSheet,
  type HostInstance,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';

import type { EntryKind } from './normalize';
import { InteractionLifecycle } from './lifecycle';
import { canonicalMoveSet } from './semantic';
import type { CollectionOrder } from './types';
import {
  activeFeedbackTranslation,
  destinationFeedbackPosition,
} from './visual-feedback';

let nextFallbackInteractionId = 0;

export type FallbackTerminalEvent =
  | Readonly<{ interactionId: number; outcome: 'cancel' }>
  | Readonly<{
      interactionId: number;
      outcome: 'commit';
      sourceIdsJson: string;
      destinationCollectionId: string;
      destinationBeforeId: string;
    }>;

export type FallbackAcceptanceMove = Readonly<{
  sourceIds: readonly string[];
  destination: Readonly<{
    sectionId: string | null;
    beforeId: string | null;
  }>;
}>;

type LayoutSlot = Readonly<{ height: number; y: number }>;

export function activePreviewTranslation(
  platform: typeof Platform.OS,
  activeLayout: LayoutSlot | undefined,
  destinationFeedbackY: number,
  pointerTranslation: number
): number {
  'worklet';
  if (activeLayout != null && destinationFeedbackY >= 0) {
    return activeFeedbackTranslation(
      platform,
      true,
      destinationFeedbackY,
      activeLayout.y,
      activeLayout.height,
      pointerTranslation
    );
  }
  return activeFeedbackTranslation(
    platform,
    false,
    destinationFeedbackY,
    0,
    0,
    pointerTranslation
  );
}

export { destinationFeedbackPosition };

type DragState = Readonly<{
  activeInteractionId: SharedValue<number>;
  activatedEntryIndex: SharedValue<number>;
  activeSourceIds: SharedValue<string[]>;
  debugDestinationLocked: SharedValue<boolean>;
  destinationBeforeId: SharedValue<string>;
  destinationCollectionId: SharedValue<string>;
  destinationFeedbackY: SharedValue<number>;
  layouts: SharedValue<LayoutSlot[]>;
  measurementRevision: SharedValue<number>;
  nextInteractionId: SharedValue<number>;
  pointerCorrection: SharedValue<number>;
  pointerTranslation: SharedValue<number>;
  terminalClaimed: SharedValue<boolean>;
}>;

type FallbackItemProps = Readonly<{
  child: ReactElement;
  collectionIds: readonly string[];
  containerRef: ReturnType<typeof useAnimatedRef<HostInstance>>;
  dragState: DragState;
  entryIds: readonly string[];
  entryKinds: readonly EntryKind[];
  id: string;
  index: number;
  moveSet: readonly string[];
  onInteractionStart: (interactionId: number) => void;
  onTerminal: (event: FallbackTerminalEvent) => void;
}>;

function beginInteraction(
  sourceIds: readonly string[],
  dragState: DragState,
  onInteractionStart: (interactionId: number) => void
) {
  'worklet';
  const interactionId = dragState.nextInteractionId.value + 1;
  dragState.nextInteractionId.value = interactionId;
  dragState.activeInteractionId.value = interactionId;
  dragState.terminalClaimed.value = false;
  dragState.activeSourceIds.value = [...sourceIds];
  scheduleOnRN(onInteractionStart, interactionId);
}

function finishInteraction(
  dragState: DragState,
  outcome: 'cancel' | 'commit',
  sourceIds: readonly string[],
  destinationCollectionId: string,
  destinationBeforeId: string,
  valid: boolean,
  onTerminal: (event: FallbackTerminalEvent) => void
) {
  'worklet';
  const interactionId = dragState.activeInteractionId.value;
  if (interactionId < 0 || dragState.terminalClaimed.value) return false;
  dragState.terminalClaimed.value = true;
  if (!valid || sourceIds.length === 0) {
    scheduleOnRN(onTerminal, { interactionId, outcome: 'cancel' });
    return true;
  }
  scheduleOnRN(onTerminal, {
    interactionId,
    outcome,
    sourceIdsJson: JSON.stringify(sourceIds),
    destinationCollectionId,
    destinationBeforeId,
  });
  return true;
}

function clearDragState(dragState: DragState) {
  'worklet';
  dragState.activatedEntryIndex.value = -1;
  dragState.activeInteractionId.value = -1;
  dragState.activeSourceIds.value = [];
  dragState.debugDestinationLocked.value = false;
  dragState.destinationBeforeId.value = '';
  dragState.destinationCollectionId.value = '';
  dragState.destinationFeedbackY.value = -1;
  dragState.pointerCorrection.value = 0;
  dragState.pointerTranslation.value = 0;
}

function updateDestination(
  activeCenter: number,
  activeSourceIds: readonly string[],
  entryIds: readonly string[],
  entryKinds: readonly EntryKind[],
  collectionIds: readonly string[],
  layouts: readonly LayoutSlot[],
  dragState: DragState
) {
  'worklet';
  const sourceSet = new Set(activeSourceIds);
  const collectionOrder: string[] = [];
  for (let index = 0; index < entryKinds.length; index++) {
    const collectionId = collectionIds[index] ?? '';
    if (!collectionOrder.includes(collectionId))
      collectionOrder.push(collectionId);
  }

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestCollectionId = '';
  let bestBeforeId = '';
  let bestY = 0;
  for (const collectionId of collectionOrder) {
    let collectionStart = Number.POSITIVE_INFINITY;
    let collectionEnd = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < entryKinds.length; index++) {
      if ((collectionIds[index] ?? '') !== collectionId) continue;
      const slot = layouts[index];
      if (slot == null) continue;
      collectionStart = Math.min(collectionStart, slot.y);
      collectionEnd = Math.max(collectionEnd, slot.y + slot.height);
      if (entryKinds[index] !== 'item') continue;
      const itemId = entryIds[index] ?? '';
      if (sourceSet.has(itemId)) continue;
      const distance = Math.abs(activeCenter - slot.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCollectionId = collectionId;
        bestBeforeId = itemId;
        bestY = slot.y;
      }
    }

    if (Number.isFinite(collectionStart) && Number.isFinite(collectionEnd)) {
      const endDistance = Math.abs(activeCenter - collectionEnd);
      if (endDistance < bestDistance) {
        bestDistance = endDistance;
        bestCollectionId = collectionId;
        bestBeforeId = '';
        bestY = collectionEnd;
      }
    }
  }

  if (Number.isFinite(bestDistance)) {
    dragState.destinationCollectionId.value = bestCollectionId;
    dragState.destinationBeforeId.value = bestBeforeId;
    dragState.destinationFeedbackY.value = bestY;
  }
}

function refreshDestination(
  collectionIds: readonly string[],
  dragState: DragState,
  entryIds: readonly string[],
  entryKinds: readonly EntryKind[]
) {
  'worklet';
  if (dragState.debugDestinationLocked.value) return;
  const activeIndex = dragState.activatedEntryIndex.value;
  if (activeIndex < 0) return;
  const activeLayout = dragState.layouts.value[activeIndex];
  if (activeLayout == null) return;
  updateDestination(
    activeLayout.y +
      activeLayout.height / 2 +
      dragState.pointerTranslation.value +
      dragState.pointerCorrection.value,
    dragState.activeSourceIds.value,
    entryIds,
    entryKinds,
    collectionIds,
    dragState.layouts.value,
    dragState
  );
}

function useMeasuredEntry(
  collectionIds: readonly string[],
  containerRef: ReturnType<typeof useAnimatedRef<HostInstance>>,
  dragState: DragState,
  entryIds: readonly string[],
  entryKinds: readonly EntryKind[],
  index: number
) {
  const entryRef = useAnimatedRef<HostInstance>();
  useAnimatedReaction(
    () =>
      `${dragState.activatedEntryIndex.value}:${dragState.pointerTranslation.value}:${dragState.measurementRevision.value}`,
    () => {
      const entryFrame = measure(entryRef);
      const containerFrame = measure(containerRef);
      if (entryFrame == null || containerFrame == null) return;
      const nextSlot = {
        height: entryFrame.height,
        y: entryFrame.pageY - containerFrame.pageY,
      };
      const previousSlot = dragState.layouts.value[index];
      if (
        dragState.activatedEntryIndex.value === index &&
        previousSlot != null
      ) {
        return;
      }
      if (
        previousSlot?.height === nextSlot.height &&
        previousSlot.y === nextSlot.y
      ) {
        return;
      }
      dragState.layouts.modify((current) => {
        current[index] = nextSlot;
        return current;
      });
      if (
        dragState.activatedEntryIndex.value === index &&
        previousSlot != null
      ) {
        dragState.pointerCorrection.value += previousSlot.y - nextSlot.y;
      }
      refreshDestination(collectionIds, dragState, entryIds, entryKinds);
    }
  );
  return entryRef;
}

function FallbackItem({
  child,
  collectionIds,
  containerRef,
  dragState,
  entryIds,
  entryKinds,
  id,
  index,
  moveSet,
  onInteractionStart,
  onTerminal,
}: FallbackItemProps) {
  const itemRef = useMeasuredEntry(
    collectionIds,
    containerRef,
    dragState,
    entryIds,
    entryKinds,
    index
  );
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(`fallback-item-${id}`)
        .activateAfterLongPress(350)
        .onStart(() => {
          beginInteraction(moveSet, dragState, onInteractionStart);
          dragState.activatedEntryIndex.value = index;
          dragState.pointerCorrection.value = 0;
          dragState.pointerTranslation.value = 0;
          const slot = dragState.layouts.value[index];
          if (slot != null) {
            updateDestination(
              slot.y + slot.height / 2,
              moveSet,
              entryIds,
              entryKinds,
              collectionIds,
              dragState.layouts.value,
              dragState
            );
          }
        })
        .onUpdate((event) => {
          dragState.pointerTranslation.value = event.translationY;
          const activeLayout = dragState.layouts.value[index];
          if (activeLayout == null) return;
          updateDestination(
            activeLayout.y +
              activeLayout.height / 2 +
              event.translationY +
              dragState.pointerCorrection.value,
            moveSet,
            entryIds,
            entryKinds,
            collectionIds,
            dragState.layouts.value,
            dragState
          );
        })
        .onEnd((event) => {
          const frame = measure(containerRef);
          const withinContainer =
            frame != null &&
            event.absoluteX >= frame.pageX &&
            event.absoluteX <= frame.pageX + frame.width &&
            event.absoluteY >= frame.pageY &&
            event.absoluteY <= frame.pageY + frame.height;
          finishInteraction(
            dragState,
            'commit',
            moveSet,
            dragState.destinationCollectionId.value,
            dragState.destinationBeforeId.value,
            withinContainer && dragState.destinationFeedbackY.value >= 0,
            onTerminal
          );
        })
        .onFinalize((_event, success) => {
          if (!success) {
            finishInteraction(
              dragState,
              'cancel',
              [],
              '',
              '',
              false,
              onTerminal
            );
          }
          clearDragState(dragState);
        }),
    [
      collectionIds,
      containerRef,
      dragState,
      entryIds,
      entryKinds,
      id,
      index,
      moveSet,
      onInteractionStart,
      onTerminal,
    ]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const isMoved = dragState.activeSourceIds.value.includes(id);
    if (!isMoved) return { transform: [{ translateY: 0 }] };
    const activeLayout = dragState.layouts.value[index];
    return {
      borderColor: '#0A84FF',
      borderWidth: 3,
      elevation: 8,
      opacity: 0.94,
      transform: [
        {
          translateY: activePreviewTranslation(
            Platform.OS,
            activeLayout,
            dragState.destinationFeedbackY.value,
            dragState.pointerTranslation.value +
              dragState.pointerCorrection.value
          ),
        },
        { scale: withTiming(1.03, { duration: 100 }) },
      ],
      zIndex: 2,
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        ref={itemRef}
        style={animatedStyle}
        testID={`fallback-wrapper-${id}`}
      >
        {child}
      </Animated.View>
    </GestureDetector>
  );
}

function MeasuredStructuralEntry({
  child,
  collectionIds,
  containerRef,
  dragState,
  entryIds,
  entryKinds,
  index,
}: Readonly<{
  child: ReactElement;
  collectionIds: readonly string[];
  containerRef: ReturnType<typeof useAnimatedRef<HostInstance>>;
  dragState: DragState;
  entryIds: readonly string[];
  entryKinds: readonly EntryKind[];
  index: number;
}>) {
  const entryRef = useMeasuredEntry(
    collectionIds,
    containerRef,
    dragState,
    entryIds,
    entryKinds,
    index
  );
  return <Animated.View ref={entryRef}>{child}</Animated.View>;
}

function DestinationFeedback({ dragState }: { dragState: DragState }) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: dragState.activatedEntryIndex.value < 0 ? 0 : 1,
    top: withTiming(
      Math.max(
        0,
        destinationFeedbackPosition(
          Platform.OS,
          dragState.destinationFeedbackY.value
        )
      ),
      { duration: 120 }
    ),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.destination, animatedStyle]}
      testID="fallback-destination-feedback"
    />
  );
}

type FallbackAcceptanceControlsProps = Readonly<{
  acceptanceMove: FallbackAcceptanceMove;
  collectionIds: readonly string[];
  dragState: DragState;
  entryIds: readonly string[];
  entryKinds: readonly EntryKind[];
  onTerminal: (event: FallbackTerminalEvent) => void;
  onInteractionStart: (interactionId: number) => void;
}>;

function FallbackAcceptanceControls({
  acceptanceMove,
  collectionIds,
  dragState,
  entryIds,
  entryKinds,
  onInteractionStart,
  onTerminal,
}: FallbackAcceptanceControlsProps) {
  const sourceEntryIndex = entryIds.findIndex(
    (id, index) =>
      entryKinds[index] === 'item' && id === acceptanceMove.sourceIds[0]
  );
  const destinationEntryIndex =
    acceptanceMove.destination.beforeId == null
      ? -1
      : entryIds.findIndex(
          (id, index) =>
            entryKinds[index] === 'item' &&
            id === acceptanceMove.destination.beforeId
        );
  return (
    <>
      <Button
        accessibilityLabel="Activate fallback reorder"
        onPress={() => {
          scheduleOnUI(() => {
            'worklet';
            if (dragState.layouts.value.length === 0) {
              dragState.layouts.value = entryIds.map((_id, index) => ({
                height: 64,
                y: index * 72,
              }));
            }
            beginInteraction(
              acceptanceMove.sourceIds,
              dragState,
              onInteractionStart
            );
            dragState.activatedEntryIndex.value = sourceEntryIndex;
            dragState.debugDestinationLocked.value = false;
            dragState.measurementRevision.value += 1;
            dragState.pointerCorrection.value = 0;
            const sourceLayout = dragState.layouts.value[sourceEntryIndex];
            dragState.destinationFeedbackY.value =
              sourceLayout == null
                ? 0
                : sourceLayout.y + sourceLayout.height + 2;
          });
        }}
        title="Activate fallback reorder"
      />
      <Button
        accessibilityLabel="Move fallback destination"
        onPress={() => {
          scheduleOnUI(() => {
            'worklet';
            dragState.debugDestinationLocked.value = true;
            dragState.destinationCollectionId.value =
              acceptanceMove.destination.sectionId ?? '';
            dragState.destinationBeforeId.value =
              acceptanceMove.destination.beforeId ?? '';
            const targetLayout = dragState.layouts.value[destinationEntryIndex];
            dragState.destinationFeedbackY.value =
              targetLayout == null
                ? Math.max(
                    0,
                    ...dragState.layouts.value.flatMap((slot, index) =>
                      collectionIds[index] ===
                      (acceptanceMove.destination.sectionId ?? '')
                        ? [slot.y + slot.height]
                        : []
                    )
                  )
                : targetLayout.y + targetLayout.height + 2;
          });
        }}
        title="Move fallback destination"
      />
      <Button
        accessibilityLabel="Commit fallback reorder"
        onPress={() => {
          scheduleOnUI(() => {
            'worklet';
            finishInteraction(
              dragState,
              'commit',
              acceptanceMove.sourceIds,
              dragState.destinationCollectionId.value,
              dragState.destinationBeforeId.value,
              dragState.destinationFeedbackY.value >= 0,
              onTerminal
            );
            clearDragState(dragState);
          });
        }}
        title="Commit fallback reorder"
      />
      <Button
        accessibilityLabel="Cancel fallback reorder"
        onPress={() => {
          scheduleOnUI(() => {
            'worklet';
            finishInteraction(
              dragState,
              'cancel',
              [],
              '',
              '',
              false,
              onTerminal
            );
            clearDragState(dragState);
          });
        }}
        title="Cancel fallback reorder"
      />
      <Button
        accessibilityLabel="Release fallback outside"
        onPress={() => {
          scheduleOnUI(() => {
            'worklet';
            finishInteraction(
              dragState,
              'cancel',
              acceptanceMove.sourceIds,
              dragState.destinationCollectionId.value,
              dragState.destinationBeforeId.value,
              false,
              onTerminal
            );
            clearDragState(dragState);
          });
        }}
        title="Release fallback outside"
      />
    </>
  );
}

export type FallbackReorderContainerProps = ViewProps &
  Readonly<{
    children: readonly ReactElement[];
    collectionIds: readonly string[];
    debugAcceptanceMove?: FallbackAcceptanceMove;
    entryIds: readonly string[];
    entryKinds: readonly EntryKind[];
    forwardedRef: Ref<HostInstance> | undefined;
    onInteractionStateChange?: (active: boolean) => void;
    onTerminal: (event: FallbackTerminalEvent) => void;
    onInteractionStart: (interactionId: number) => void;
    order: readonly CollectionOrder[];
    selectedIds: readonly string[];
  }>;

export function FallbackReorderContainer({
  children,
  collectionIds,
  debugAcceptanceMove,
  entryIds,
  entryKinds,
  forwardedRef,
  onInteractionStateChange,
  onTerminal,
  onInteractionStart,
  order,
  selectedIds,
  ...viewProps
}: FallbackReorderContainerProps) {
  const containerRef = useAnimatedRef<HostInstance>();
  const currentDragState: DragState = {
    activeInteractionId: useSharedValue(-1),
    activatedEntryIndex: useSharedValue(-1),
    activeSourceIds: useSharedValue<string[]>([]),
    debugDestinationLocked: useSharedValue(false),
    destinationBeforeId: useSharedValue(''),
    destinationCollectionId: useSharedValue(''),
    destinationFeedbackY: useSharedValue(-1),
    layouts: useSharedValue<LayoutSlot[]>([]),
    measurementRevision: useSharedValue(0),
    nextInteractionId: useSharedValue(0),
    pointerCorrection: useSharedValue(0),
    pointerTranslation: useSharedValue(0),
    terminalClaimed: useSharedValue(false),
  };
  const dragState = useRef(currentDragState).current;

  const interactionLifecycle = useRef(new InteractionLifecycle()).current;
  const canonicalInteractionIds = useRef(new Map<number, number>());
  const onInteractionStartRef = useRef(onInteractionStart);
  const onTerminalRef = useRef(onTerminal);
  onInteractionStartRef.current = onInteractionStart;
  onTerminalRef.current = onTerminal;
  const handleInteractionStart = useCallback(
    (interactionId: number) => {
      interactionLifecycle.begin(interactionId);
      onInteractionStateChange?.(true);
      const canonicalId = ++nextFallbackInteractionId;
      canonicalInteractionIds.current.set(interactionId, canonicalId);
      onInteractionStartRef.current(canonicalId);
    },
    [interactionLifecycle, onInteractionStateChange]
  );
  const handleTerminal = useCallback(
    (event: FallbackTerminalEvent) => {
      const canonicalId = canonicalInteractionIds.current.get(
        event.interactionId
      );
      if (canonicalId == null) return;
      canonicalInteractionIds.current.delete(event.interactionId);
      if (interactionLifecycle.finish(event.interactionId, event.outcome)) {
        onInteractionStateChange?.(false);
      }
      onTerminalRef.current({ ...event, interactionId: canonicalId });
    },
    [interactionLifecycle, onInteractionStateChange]
  );
  const cancelActiveInteraction = useCallback(() => {
    if (!interactionLifecycle.cancelActive()) return false;
    onInteractionStateChange?.(false);
    scheduleOnUI(() => {
      'worklet';
      finishInteraction(dragState, 'cancel', [], '', '', false, handleTerminal);
      clearDragState(dragState);
    });
    return true;
  }, [
    dragState,
    handleTerminal,
    interactionLifecycle,
    onInteractionStateChange,
  ]);

  useEffect(() => {
    const changeSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cancelActiveInteraction();
    });
    const blurSubscription =
      Platform.OS === 'android'
        ? AppState.addEventListener('blur', cancelActiveInteraction)
        : null;
    const backSubscription =
      Platform.OS === 'android'
        ? BackHandler.addEventListener('hardwareBackPress', () => {
            return cancelActiveInteraction();
          })
        : null;
    return () => {
      changeSubscription?.remove();
      blurSubscription?.remove();
      backSubscription?.remove();
      cancelActiveInteraction();
    };
  }, [cancelActiveInteraction]);

  useEffect(() => {
    scheduleOnUI(() => {
      'worklet';
      dragState.measurementRevision.value += 1;
    });
  }, [children, dragState.measurementRevision]);

  useImperativeHandle(
    forwardedRef,
    () => containerRef.current as HostInstance,
    [containerRef]
  );
  const handleDebugMove = useCallback(
    (
      event: NativeSyntheticEvent<
        Omit<
          Extract<FallbackTerminalEvent, { outcome: 'commit' }>,
          'interactionId' | 'outcome'
        >
      >
    ) => {
      const interactionId = dragState.nextInteractionId.value + 1;
      dragState.nextInteractionId.value = interactionId;
      handleInteractionStart(interactionId);
      handleTerminal({
        ...event.nativeEvent,
        interactionId,
        outcome: 'commit',
      });
    },
    [dragState.nextInteractionId, handleInteractionStart, handleTerminal]
  );
  const debugProps = __DEV__
    ? ({ onFallbackMove: handleDebugMove } as unknown as ViewProps)
    : undefined;

  return (
    <Animated.View
      {...viewProps}
      {...debugProps}
      ref={containerRef}
      style={viewProps.style}
    >
      {debugAcceptanceMove == null ? null : (
        <FallbackAcceptanceControls
          acceptanceMove={debugAcceptanceMove}
          collectionIds={collectionIds}
          dragState={dragState}
          entryIds={entryIds}
          entryKinds={entryKinds}
          onInteractionStart={handleInteractionStart}
          onTerminal={handleTerminal}
        />
      )}
      {children.map((child, index) =>
        entryKinds[index] === 'item' ? (
          <FallbackItem
            child={child}
            collectionIds={collectionIds}
            containerRef={containerRef}
            dragState={dragState}
            entryIds={entryIds}
            entryKinds={entryKinds}
            id={entryIds[index] ?? ''}
            index={index}
            key={child.key ?? `fallback:${index}`}
            moveSet={canonicalMoveSet(
              order,
              entryIds[index] ?? '',
              selectedIds
            )}
            onInteractionStart={handleInteractionStart}
            onTerminal={handleTerminal}
          />
        ) : (
          <MeasuredStructuralEntry
            child={child}
            collectionIds={collectionIds}
            containerRef={containerRef}
            dragState={dragState}
            entryIds={entryIds}
            entryKinds={entryKinds}
            index={index}
            key={child.key ?? `fallback:${index}`}
          />
        )
      )}
      <DestinationFeedback dragState={dragState} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  destination: {
    backgroundColor: '#0A84FF',
    borderRadius: 2,
    height: 4,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 3,
  },
});
