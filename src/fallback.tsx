import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
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
  Button,
  StyleSheet,
  type HostInstance,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';

import type { EntryKind } from './normalize';
import { canonicalMoveSet } from './semantic';
import type { CollectionOrder } from './types';

export type FallbackTerminalEvent = Readonly<{
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
type DragState = Readonly<{
  activatedEntryIndex: SharedValue<number>;
  activeSourceIds: SharedValue<string[]>;
  debugDestinationLocked: SharedValue<boolean>;
  destinationBeforeId: SharedValue<string>;
  destinationCollectionId: SharedValue<string>;
  destinationFeedbackY: SharedValue<number>;
  layouts: SharedValue<LayoutSlot[]>;
  measurementRevision: SharedValue<number>;
  pointerCorrection: SharedValue<number>;
  pointerTranslation: SharedValue<number>;
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
  onTerminal: (event: FallbackTerminalEvent | null) => void;
}>;

function emitFallbackTerminal(
  sourceIds: readonly string[],
  destinationCollectionId: string,
  destinationBeforeId: string,
  valid: boolean,
  onTerminal: (event: FallbackTerminalEvent | null) => void
) {
  'worklet';
  if (!valid || sourceIds.length === 0) {
    scheduleOnRN(onTerminal, null);
    return;
  }
  scheduleOnRN(onTerminal, {
    sourceIdsJson: JSON.stringify(sourceIds),
    destinationCollectionId,
    destinationBeforeId,
  });
}

function clearDragState(dragState: DragState) {
  'worklet';
  dragState.activatedEntryIndex.value = -1;
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
          dragState.activatedEntryIndex.value = index;
          dragState.activeSourceIds.value = [...moveSet];
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
          emitFallbackTerminal(
            moveSet,
            dragState.destinationCollectionId.value,
            dragState.destinationBeforeId.value,
            withinContainer && dragState.destinationFeedbackY.value >= 0,
            onTerminal
          );
        })
        .onFinalize((_event, success) => {
          if (!success) scheduleOnRN(onTerminal, null);
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
      onTerminal,
    ]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const isMoved = dragState.activeSourceIds.value.includes(id);
    if (!isMoved) return { transform: [{ translateY: 0 }] };
    return {
      elevation: 8,
      opacity: 0.94,
      transform: [
        {
          translateY:
            dragState.pointerTranslation.value +
            dragState.pointerCorrection.value,
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
    top: withTiming(Math.max(0, dragState.destinationFeedbackY.value), {
      duration: 120,
    }),
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
  onTerminal: (event: FallbackTerminalEvent | null) => void;
}>;

function FallbackAcceptanceControls({
  acceptanceMove,
  collectionIds,
  dragState,
  entryIds,
  entryKinds,
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
            dragState.activatedEntryIndex.value = sourceEntryIndex;
            dragState.activeSourceIds.value = [...acceptanceMove.sourceIds];
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
            emitFallbackTerminal(
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
            scheduleOnRN(onTerminal, null);
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
            emitFallbackTerminal(
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
    onTerminal: (event: FallbackTerminalEvent | null) => void;
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
  onTerminal,
  order,
  selectedIds,
  ...viewProps
}: FallbackReorderContainerProps) {
  const containerRef = useAnimatedRef<HostInstance>();
  const dragState: DragState = {
    activatedEntryIndex: useSharedValue(-1),
    activeSourceIds: useSharedValue<string[]>([]),
    debugDestinationLocked: useSharedValue(false),
    destinationBeforeId: useSharedValue(''),
    destinationCollectionId: useSharedValue(''),
    destinationFeedbackY: useSharedValue(-1),
    layouts: useSharedValue<LayoutSlot[]>([]),
    measurementRevision: useSharedValue(0),
    pointerCorrection: useSharedValue(0),
    pointerTranslation: useSharedValue(0),
  };

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
    (event: NativeSyntheticEvent<FallbackTerminalEvent>) => {
      onTerminal(event.nativeEvent);
    },
    [onTerminal]
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
          onTerminal={onTerminal}
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
            onTerminal={onTerminal}
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
