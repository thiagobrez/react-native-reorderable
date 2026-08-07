import {
  useCallback,
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

type FallbackItemProps = Readonly<{
  child: ReactElement;
  id: string;
  index: number;
  itemIds: readonly string[];
  itemIndices: readonly number[];
  layouts: SharedValue<LayoutSlot[]>;
  activeIndex: SharedValue<number>;
  destinationItemIndex: SharedValue<number>;
  pointerTranslation: SharedValue<number>;
  containerRef: ReturnType<typeof useAnimatedRef<HostInstance>>;
  onTerminal: (event: FallbackTerminalEvent | null) => void;
}>;

type DestinationFeedbackProps = Readonly<{
  activeIndex: SharedValue<number>;
  destinationItemIndex: SharedValue<number>;
  itemIndices: readonly number[];
  layouts: SharedValue<LayoutSlot[]>;
}>;

function DestinationFeedback({
  activeIndex,
  destinationItemIndex,
  itemIndices,
  layouts,
}: DestinationFeedbackProps) {
  const animatedStyle = useAnimatedStyle(() => {
    if (activeIndex.value < 0 || destinationItemIndex.value < 0) {
      return { opacity: 0, top: 0 };
    }
    const destinationEntryIndex =
      itemIndices[destinationItemIndex.value] ??
      itemIndices[itemIndices.length - 1];
    const destinationLayout = layouts.value[destinationEntryIndex ?? -1];
    const top =
      destinationLayout == null
        ? 0
        : destinationLayout.y + destinationLayout.height + 2;
    return { opacity: 1, top: withTiming(top, { duration: 120 }) };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.destination, animatedStyle]}
      testID="fallback-destination-feedback"
    />
  );
}

function destinationBeforeId(
  itemIds: readonly string[],
  sourceIndex: number,
  destinationIndex: number
): string {
  'worklet';
  const remaining = itemIds.filter((_id, index) => index !== sourceIndex);
  return remaining[destinationIndex] ?? '';
}

function emitFallbackTerminal(
  itemIds: readonly string[],
  sourceItemIndex: number,
  destinationItemIndex: number,
  id: string,
  valid: boolean,
  onTerminal: (event: FallbackTerminalEvent | null) => void
) {
  'worklet';
  if (!valid) {
    scheduleOnRN(onTerminal, null);
    return;
  }
  scheduleOnRN(onTerminal, {
    sourceIdsJson: JSON.stringify([id]),
    destinationCollectionId: '',
    destinationBeforeId: destinationBeforeId(
      itemIds,
      sourceItemIndex,
      destinationItemIndex
    ),
  });
}

function FallbackItem({
  activeIndex,
  child,
  containerRef,
  destinationItemIndex,
  id,
  index,
  itemIds,
  itemIndices,
  layouts,
  onTerminal,
  pointerTranslation,
}: FallbackItemProps) {
  const itemIndex = itemIndices.indexOf(index);
  const itemRef = useAnimatedRef<HostInstance>();

  useAnimatedReaction(
    () => activeIndex.value,
    (current, previous) => {
      if (current < 0 || previous === current) return;
      const itemFrame = measure(itemRef);
      const containerFrame = measure(containerRef);
      if (itemFrame == null || containerFrame == null) return;
      layouts.modify((currentLayouts) => {
        'worklet';
        currentLayouts[index] = {
          height: itemFrame.height,
          y: itemFrame.pageY - containerFrame.pageY,
        };
        return currentLayouts;
      });
    },
    [index]
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(`fallback-item-${id}`)
        .activateAfterLongPress(350)
        .onStart(() => {
          activeIndex.value = index;
          destinationItemIndex.value = itemIndex;
          pointerTranslation.value = 0;
        })
        .onUpdate((event) => {
          pointerTranslation.value = event.translationY;
          const activeLayout = layouts.value[index];
          if (activeLayout == null) return;
          const activeCenter =
            activeLayout.y + activeLayout.height / 2 + event.translationY;
          let insertion = 0;
          for (let candidate = 0; candidate < itemIndices.length; candidate++) {
            if (candidate === itemIndex) continue;
            const slot = layouts.value[itemIndices[candidate] ?? -1];
            if (slot == null) continue;
            if (activeCenter >= slot.y + slot.height / 2) insertion += 1;
          }
          destinationItemIndex.value = insertion;
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
            itemIds,
            itemIndex,
            destinationItemIndex.value,
            id,
            withinContainer,
            onTerminal
          );
        })
        .onFinalize((_event, success) => {
          if (!success) scheduleOnRN(onTerminal, null);
          activeIndex.value = -1;
          destinationItemIndex.value = -1;
          pointerTranslation.value = 0;
        }),
    [
      activeIndex,
      containerRef,
      destinationItemIndex,
      id,
      index,
      itemIds,
      itemIndex,
      itemIndices,
      layouts,
      onTerminal,
      pointerTranslation,
    ]
  );

  const animatedStyle = useAnimatedStyle(() => {
    if (activeIndex.value < 0) return { transform: [{ translateY: 0 }] };
    if (activeIndex.value === index) {
      return {
        elevation: 8,
        opacity: 0.94,
        transform: [
          { translateY: pointerTranslation.value },
          { scale: withTiming(1.03, { duration: 100 }) },
        ],
        zIndex: 2,
      };
    }

    const activeItemIndex = itemIndices.indexOf(activeIndex.value);
    const ownItemIndex = itemIndices.indexOf(index);
    if (activeItemIndex < 0 || ownItemIndex < 0) {
      return { transform: [{ translateY: 0 }] };
    }
    const orderWithoutActive = itemIndices.filter(
      (entryIndex) => entryIndex !== activeIndex.value
    );
    orderWithoutActive.splice(destinationItemIndex.value, 0, activeIndex.value);
    const targetItemIndex = orderWithoutActive.indexOf(index);
    const ownLayout = layouts.value[index];
    const targetLayout = layouts.value[itemIndices[targetItemIndex] ?? -1];
    const translation =
      ownLayout == null || targetLayout == null
        ? 0
        : targetLayout.y - ownLayout.y;
    return {
      transform: [{ translateY: withTiming(translation, { duration: 120 }) }],
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

type FallbackAcceptanceControlsProps = Readonly<{
  acceptanceMove: FallbackAcceptanceMove;
  activeIndex: SharedValue<number>;
  destinationItemIndex: SharedValue<number>;
  itemIds: readonly string[];
  itemIndices: readonly number[];
  layouts: SharedValue<LayoutSlot[]>;
  onTerminal: (event: FallbackTerminalEvent | null) => void;
  pointerTranslation: SharedValue<number>;
}>;

function FallbackAcceptanceControls({
  acceptanceMove,
  activeIndex,
  destinationItemIndex,
  itemIds,
  itemIndices,
  layouts,
  onTerminal,
  pointerTranslation,
}: FallbackAcceptanceControlsProps) {
  const sourceId = acceptanceMove.sourceIds[0] ?? '';
  const sourceItemIndex = itemIds.indexOf(sourceId);
  const sourceEntryIndex = itemIndices[sourceItemIndex] ?? -1;
  const remainingIds = itemIds.filter(
    (_id, index) => index !== sourceItemIndex
  );
  const destinationItemIndexValue =
    acceptanceMove.destination.beforeId == null
      ? remainingIds.length
      : remainingIds.indexOf(acceptanceMove.destination.beforeId);

  return (
    <>
      <Button
        accessibilityLabel="Activate fallback reorder"
        onPress={() => {
          scheduleOnUI(() => {
            'worklet';
            if (layouts.value.length === 0) {
              layouts.value = itemIndices.map((_entryIndex, index) => ({
                height: 64,
                y: index * 72,
              }));
            }
            activeIndex.value = sourceEntryIndex;
            destinationItemIndex.value = sourceItemIndex;
            pointerTranslation.value = 0;
          });
        }}
        title="Activate fallback reorder"
      />
      <Button
        accessibilityLabel="Move fallback destination"
        onPress={() => {
          scheduleOnUI(() => {
            'worklet';
            const sourceLayout = layouts.value[sourceEntryIndex];
            const targetEntryIndex =
              itemIndices[destinationItemIndexValue] ??
              itemIndices[itemIndices.length - 1];
            const targetLayout = layouts.value[targetEntryIndex ?? -1];
            destinationItemIndex.value = destinationItemIndexValue;
            if (sourceLayout != null && targetLayout != null) {
              pointerTranslation.value = targetLayout.y - sourceLayout.y;
            }
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
              itemIds,
              sourceItemIndex,
              destinationItemIndex.value,
              sourceId,
              destinationItemIndex.value >= 0,
              onTerminal
            );
            activeIndex.value = -1;
            destinationItemIndex.value = -1;
            pointerTranslation.value = 0;
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
            activeIndex.value = -1;
            destinationItemIndex.value = -1;
            pointerTranslation.value = 0;
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
              itemIds,
              sourceItemIndex,
              destinationItemIndex.value,
              sourceId,
              false,
              onTerminal
            );
            activeIndex.value = -1;
            destinationItemIndex.value = -1;
            pointerTranslation.value = 0;
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
    entryIds: readonly string[];
    entryKinds: readonly EntryKind[];
    forwardedRef: Ref<HostInstance> | undefined;
    onTerminal: (event: FallbackTerminalEvent | null) => void;
    debugAcceptanceMove?: FallbackAcceptanceMove;
  }>;

export function FallbackReorderContainer({
  children,
  entryIds,
  entryKinds,
  forwardedRef,
  onTerminal,
  debugAcceptanceMove,
  ...viewProps
}: FallbackReorderContainerProps) {
  const containerRef = useAnimatedRef<HostInstance>();
  const activeIndex = useSharedValue(-1);
  const destinationItemIndex = useSharedValue(-1);
  const pointerTranslation = useSharedValue(0);
  const layouts = useSharedValue<LayoutSlot[]>([]);
  const itemIndices = entryKinds.flatMap((kind, index) =>
    kind === 'item' ? [index] : []
  );
  const itemIds = itemIndices.map((index) => entryIds[index] ?? '');

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
          activeIndex={activeIndex}
          destinationItemIndex={destinationItemIndex}
          itemIds={itemIds}
          itemIndices={itemIndices}
          layouts={layouts}
          onTerminal={onTerminal}
          pointerTranslation={pointerTranslation}
        />
      )}
      {children.map((child, index) =>
        entryKinds[index] === 'item' ? (
          <FallbackItem
            activeIndex={activeIndex}
            child={child}
            containerRef={containerRef}
            destinationItemIndex={destinationItemIndex}
            id={entryIds[index] ?? ''}
            index={index}
            itemIds={itemIds}
            itemIndices={itemIndices}
            key={child.key ?? `fallback:${index}`}
            layouts={layouts}
            onTerminal={onTerminal}
            pointerTranslation={pointerTranslation}
          />
        ) : (
          child
        )
      )}
      <DestinationFeedback
        activeIndex={activeIndex}
        destinationItemIndex={destinationItemIndex}
        itemIndices={itemIndices}
        layouts={layouts}
      />
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
