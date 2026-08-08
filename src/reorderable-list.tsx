import {
  isValidElement,
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactElement,
  type ComponentType,
  type Ref,
  type RefAttributes,
} from 'react';
import {
  AppState,
  AccessibilityInfo,
  BackHandler,
  FlatList,
  Platform,
  StyleSheet,
  View,
  findNodeHandle,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type FrameCallback,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { reconcileReorder } from './semantic';
import { accessibleReorderMove } from './semantic';
import {
  collectionOrderSignature,
  resolveAccessibilityStrings,
} from './accessibility';
import type {
  ReorderableItemLayout,
  ReorderableListProps,
  ReorderableListRenderItemInfo,
} from './types';
import {
  applyMeasurement,
  applyMeasurementBatch,
  contentLength,
  createEstimatedGeometry,
  createExactGeometry,
  indexAtOffset,
  itemOffset,
  type VirtualizedGeometry,
} from './virtualized-geometry';
import {
  assignViewportRef,
  useOwnedAnimatedScrollComponent,
} from './viewport-adapter';

const RESERVED_RUNTIME_PROPS = [
  'CellRendererComponent',
  'maintainVisibleContentPosition',
  'renderScrollComponent',
] as const;
const LONG_PRESS_SLOP = 24;
const EMPTY_SELECTED_IDS: readonly string[] = [];

const NON_FLAT_LIST_PROPS = [
  'accessibilityStrings',
  'engine',
  'horizontal',
  'inverted',
  'numColumns',
] as const;

function assertSupportedProps(props: Record<string, unknown>): void {
  for (const name of RESERVED_RUNTIME_PROPS) {
    if (Object.prototype.hasOwnProperty.call(props, name)) {
      throw new Error(
        `[react-native-reorderable] ReorderableList owns the correctness-critical ${name} prop; remove it.`
      );
    }
  }
  if (props.horizontal === true) {
    throw new Error(
      '[react-native-reorderable] ReorderableList does not support horizontal lists in v1.'
    );
  }
  if (props.inverted === true) {
    throw new Error(
      '[react-native-reorderable] ReorderableList does not support inverted lists in v1.'
    );
  }
  if (typeof props.numColumns === 'number' && props.numColumns !== 1) {
    throw new Error(
      '[react-native-reorderable] ReorderableList does not support multi-column lists in v1.'
    );
  }
}

function removeNonFlatListProps(
  props: Record<string, unknown>
): Record<string, unknown> {
  const safeProps = { ...props };
  for (const name of NON_FLAT_LIST_PROPS) delete safeProps[name];
  return safeProps;
}

function createListGeometry<Item>(
  data: readonly Item[],
  getItemLayout:
    | ((data: readonly Item[], index: number) => ReorderableItemLayout)
    | undefined,
  estimatedItemSize: number | undefined
): VirtualizedGeometry {
  return getItemLayout == null
    ? createEstimatedGeometry(
        data.length,
        estimatedItemSize ?? 64,
        estimatedItemSize == null
      )
    : createExactGeometry(
        data.map((_item, index) => getItemLayout(data, index))
      );
}

function resolveDestinationIndex(
  geometry: VirtualizedGeometry,
  itemCount: number,
  sourceIndexes: readonly number[],
  contentY: number
): number {
  'worklet';
  const index = indexAtOffset(geometry, contentY, true).index;
  let low = 0;
  let high = sourceIndexes.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const sourceIndex = sourceIndexes[middle]!;
    if (sourceIndex < index) low = middle + 1;
    else if (sourceIndex > index) high = middle - 1;
    else {
      const runKey = sourceIndex - middle;
      let runLow = middle;
      let runHigh = sourceIndexes.length - 1;
      while (runLow < runHigh) {
        const candidate = Math.floor((runLow + runHigh + 1) / 2);
        if (sourceIndexes[candidate]! - candidate === runKey) {
          runLow = candidate;
        } else {
          runHigh = candidate - 1;
        }
      }
      return Math.min(itemCount, sourceIndexes[runLow]! + 1);
    }
  }
  return index;
}

function uniqueActionName(
  base: string,
  actions: NonNullable<ViewProps['accessibilityActions']>
): string {
  const names = new Set(actions.map((action) => action.name));
  let name = base;
  let suffix = 1;
  while (names.has(name)) {
    name = `${base}.${suffix}`;
    suffix += 1;
  }
  return name;
}

type ListCellProps<Item> = Readonly<{
  id: string;
  item: Item;
  index: number;
  renderItem: (
    info: ReorderableListRenderItemInfo<Item>
  ) => ReactElement | null;
  onMeasure: (id: string, index: number, length: number) => void;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  moveEarlierLabel: string;
  moveLaterLabel: string;
  onAccessibleMove: (id: string, direction: 'earlier' | 'later') => void;
  registerAccessibleRef: (id: string, value: unknown) => void;
  collectionSize: number;
  activeSourceIndexes: SharedValue<readonly number[]>;
  activeTranslationY: SharedValue<number>;
  anchorCorrection: SharedValue<number>;
}>;

function ListCell<Item>({
  id,
  item,
  index,
  renderItem,
  onMeasure,
  canMoveEarlier,
  canMoveLater,
  moveEarlierLabel,
  moveLaterLabel,
  onAccessibleMove,
  registerAccessibleRef,
  collectionSize,
  activeSourceIndexes,
  activeTranslationY,
  anchorCorrection,
}: ListCellProps<Item>) {
  const activeStyle = useAnimatedStyle(() => {
    const active = activeSourceIndexes.value.includes(index);
    return {
      elevation: active ? 8 : 0,
      opacity: active ? 0.94 : 1,
      transform: [
        {
          translateY: active
            ? activeTranslationY.value - anchorCorrection.value
            : 0,
        },
      ],
      zIndex: active ? 2 : 0,
    };
  }, [index]);
  const rendered = renderItem({ item, index });
  const renderedProps = isValidElement(rendered)
    ? (rendered.props as ViewProps)
    : {};
  const appActions = renderedProps.accessibilityActions ?? [];
  const earlierName = uniqueActionName('reorder-move-earlier', appActions);
  const laterName = uniqueActionName('reorder-move-later', appActions);
  const libraryActions: NonNullable<
    ViewProps['accessibilityActions']
  >[number][] = [];
  if (canMoveEarlier) {
    libraryActions.push({ name: earlierName, label: moveEarlierLabel });
  }
  if (canMoveLater) {
    libraryActions.push({ name: laterName, label: moveLaterLabel });
  }
  return (
    <Animated.View
      accessible={renderedProps.accessible ?? true}
      accessibilityActions={[...appActions, ...libraryActions]}
      accessibilityLabel={renderedProps.accessibilityLabel}
      accessibilityValue={{ min: 1, max: collectionSize, now: index + 1 }}
      onAccessibilityAction={(event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === earlierName) {
          onAccessibleMove(id, 'earlier');
        } else if (event.nativeEvent.actionName === laterName) {
          onAccessibleMove(id, 'later');
        } else {
          renderedProps.onAccessibilityAction?.(event);
        }
      }}
      style={activeStyle}
      onLayout={(event) =>
        onMeasure(id, index, event.nativeEvent.layout.height)
      }
      ref={(value: unknown) => registerAccessibleRef(id, value)}
      testID={`reorderable-list-wrapper-${id}`}
    >
      {rendered}
    </Animated.View>
  );
}

type ReorderableListComponentProps<Item> = ReorderableListProps<Item> &
  RefAttributes<FlatList<Item>>;

export type ReorderableListViewportAdapter = Readonly<{
  component: ComponentType<Record<string, unknown>>;
  createProps?: (options: {
    data: readonly unknown[];
    estimatedItemSize: number | undefined;
    getItemLayout:
      | ((data: readonly unknown[], index: number) => ReorderableItemLayout)
      | undefined;
    viewportProps: Record<string, unknown>;
  }) => Record<string, unknown>;
  displayName: string;
  reservedProps: readonly string[];
}>;

export function ReorderableList<Item>(
  props: ReorderableListComponentProps<Item>
) {
  return ReorderableListRuntime(props);
}

export function ReorderableListRuntime<Item, ViewportRef = FlatList<Item>>(
  props: ReorderableListProps<Item> & RefAttributes<ViewportRef>,
  viewportAdapter?: ReorderableListViewportAdapter
) {
  assertSupportedProps(props as unknown as Record<string, unknown>);
  if (viewportAdapter != null) {
    for (const name of viewportAdapter.reservedProps) {
      if (Object.prototype.hasOwnProperty.call(props, name)) {
        throw new Error(
          `[react-native-reorderable] ${viewportAdapter.displayName} owns the correctness-critical ${name} prop; remove it.`
        );
      }
    }
  }
  if (
    props.enabled !== false &&
    Platform.OS !== 'ios' &&
    Platform.OS !== 'android'
  ) {
    throw new Error(
      `[react-native-reorderable] No reorder engine can fulfill the portable ReorderableList contract for this enabled ${Platform.OS} viewport.`
    );
  }
  const {
    data,
    accessibilityStrings,
    enabled = true,
    estimatedItemSize,
    getItemLayout,
    keyExtractor,
    onLayout,
    onReorder,
    onScroll,
    ref,
    renderItem,
    selectedIds: selectedIdsProp,
    scrollEventThrottle = 16,
    ...remainingProps
  } = props as ReorderableListComponentProps<Item> & Record<string, unknown>;
  const selectedIds = selectedIdsProp ?? EMPTY_SELECTED_IDS;
  const flatListProps = removeNonFlatListProps(remainingProps);
  const itemIds = useMemo(() => {
    const ids = data.map(keyExtractor);
    const seenIds = new Set<string>();
    for (const id of ids) {
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error(
          '[react-native-reorderable] ReorderableList keyExtractor must return a non-empty string.'
        );
      }
      if (seenIds.has(id)) {
        throw new Error(
          `[react-native-reorderable] Duplicate ReorderableList item id "${id}".`
        );
      }
      seenIds.add(id);
    }
    return ids;
  }, [data, keyExtractor]);
  const nextGeometry = useMemo(
    () => createListGeometry(data, getItemLayout, estimatedItemSize),
    [data, estimatedItemSize, getItemLayout]
  );
  const animatedListRef = useAnimatedRef<FlatList<Item>>();
  const currentItemIds = useRef(itemIds);
  const onReorderRef = useRef(onReorder);
  const selectedIdsRef = useRef(selectedIds);
  const enabledRef = useRef(enabled);
  const accessibleItemRefs = useRef(new Map<string, unknown>());
  const pendingAccessibleOrder = useRef<string | null>(null);
  const resolvedAccessibilityStrings = useMemo(
    () => resolveAccessibilityStrings(accessibilityStrings),
    [accessibilityStrings]
  );
  currentItemIds.current = itemIds;
  onReorderRef.current = onReorder;
  selectedIdsRef.current = selectedIds;
  enabledRef.current = enabled;
  const gestureActivated = useSharedValue(false);
  const gestureOriginX = useSharedValue(0);
  const gestureOriginY = useSharedValue(0);
  const geometry = useSharedValue<VirtualizedGeometry>(nextGeometry);
  const uiItemIds = useSharedValue<readonly string[]>(itemIds);
  const uiSelectedIds = useSharedValue<readonly string[]>(selectedIds);
  const activeId = useSharedValue<string | null>(null);
  const activeIndex = useSharedValue(-1);
  const activeSourceIds = useSharedValue<readonly string[]>([]);
  const activeSourceIndexes = useSharedValue<readonly number[]>([]);
  const activeTranslationY = useSharedValue(0);
  const anchorCorrection = useSharedValue(0);
  const interactionStartY = useSharedValue(0);
  const pointerViewportY = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  const autoScrollOffset = useSharedValue(0);
  const autoScrollActive = useSharedValue(false);
  const destinationIndex = useSharedValue(-1);
  const feedbackViewportY = useSharedValue(0);
  const terminalSent = useSharedValue(true);
  const measurementQueue = useSharedValue<{
    cursor: number;
    ids: string[];
    indices: number[];
    lengths: number[];
  }>({ cursor: 0, ids: [], indices: [], lengths: [] });

  const handlePointerTerminal = useCallback(
    (
      cancelled: boolean,
      sourceIds: readonly string[],
      beforeId: string | null
    ) => {
      if (cancelled) return;
      const event = reconcileReorder(
        [{ sectionId: null, itemIds: currentItemIds.current }],
        sourceIds,
        { sectionId: null, beforeId }
      );
      if (event != null) onReorderRef.current(event);
    },
    []
  );

  const finishPointerInteraction = useCallback(
    (
      cancelled: boolean,
      sourceIds: readonly string[],
      beforeId: string | null
    ) => {
      'worklet';
      if (activeIndex.value < 0 || terminalSent.value) return;
      terminalSent.value = true;
      activeId.value = null;
      activeIndex.value = -1;
      activeSourceIds.value = [];
      activeSourceIndexes.value = [];
      gestureActivated.value = false;
      activeTranslationY.value = 0;
      anchorCorrection.value = 0;
      cancelAnimation(autoScrollOffset);
      autoScrollActive.value = false;
      destinationIndex.value = -1;
      pointerViewportY.value = 0;
      scheduleOnRN(handlePointerTerminal, cancelled, sourceIds, beforeId);
    },
    [
      activeIndex,
      activeId,
      activeSourceIds,
      activeSourceIndexes,
      activeTranslationY,
      anchorCorrection,
      autoScrollActive,
      autoScrollOffset,
      destinationIndex,
      gestureActivated,
      handlePointerTerminal,
      pointerViewportY,
      terminalSent,
    ]
  );

  const cancel = useCallback(() => {
    scheduleOnUI(() => {
      'worklet';
      finishPointerInteraction(true, [], null);
    });
  }, [finishPointerInteraction]);
  const registerAccessibleRef = useCallback((id: string, value: unknown) => {
    if (value == null) accessibleItemRefs.current.delete(id);
    else accessibleItemRefs.current.set(id, value);
  }, []);
  const focusAccessibleItem = useCallback((id: string) => {
    setTimeout(() => {
      const tag = findNodeHandle(accessibleItemRefs.current.get(id));
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag);
    }, 0);
  }, []);
  const handleAccessibleMove = useCallback(
    (id: string, direction: 'earlier' | 'later') => {
      if (!enabledRef.current) {
        AccessibilityInfo.announceForAccessibility(
          resolvedAccessibilityStrings.unavailableAnnouncement
        );
        focusAccessibleItem(id);
        return;
      }
      const order = [{ sectionId: null, itemIds: currentItemIds.current }];
      const accessibleMove = accessibleReorderMove(
        order,
        id,
        selectedIdsRef.current,
        direction
      );
      const event =
        accessibleMove == null
          ? null
          : reconcileReorder(
              order,
              accessibleMove.sourceIds,
              accessibleMove.destination
            );
      if (event == null) {
        AccessibilityInfo.announceForAccessibility(
          resolvedAccessibilityStrings.unavailableAnnouncement
        );
        focusAccessibleItem(id);
        return;
      }
      pendingAccessibleOrder.current = collectionOrderSignature(
        event.nextOrder
      );
      onReorderRef.current(event);
      AccessibilityInfo.announceForAccessibility(
        resolvedAccessibilityStrings.reorderAnnouncement({
          event,
          position:
            event.nextOrder[0]!.itemIds.indexOf(event.sourceIds[0]!) + 1,
          collectionSize: event.nextOrder[0]!.itemIds.length,
        })
      );
      focusAccessibleItem(id);
    },
    [focusAccessibleItem, resolvedAccessibilityStrings]
  );
  const currentOrderSignature = useMemo(
    () => collectionOrderSignature([{ sectionId: null, itemIds }]),
    [itemIds]
  );
  useEffect(() => {
    const expected = pendingAccessibleOrder.current;
    if (expected == null) return;
    pendingAccessibleOrder.current = null;
    if (expected !== currentOrderSignature) {
      AccessibilityInfo.announceForAccessibility(
        resolvedAccessibilityStrings.orderCorrectedAnnouncement
      );
    }
  });
  const refreshDestination = useCallback(() => {
    'worklet';
    if (activeIndex.value < 0 || viewportHeight.value <= 0) {
      destinationIndex.value = -1;
      return;
    }
    const contentY =
      scrollOffset.value +
      Math.max(0, Math.min(viewportHeight.value, pointerViewportY.value));
    const index = resolveDestinationIndex(
      geometry.value,
      uiItemIds.value.length,
      activeSourceIndexes.value,
      contentY
    );
    destinationIndex.value = index;
    feedbackViewportY.value = Math.max(
      0,
      Math.min(
        viewportHeight.value,
        itemOffset(geometry.value, index) - scrollOffset.value
      )
    );
  }, [
    activeIndex,
    activeSourceIndexes,
    destinationIndex,
    feedbackViewportY,
    geometry,
    pointerViewportY,
    scrollOffset,
    uiItemIds,
    viewportHeight,
  ]);
  const updateAutoScroll = useCallback(() => {
    'worklet';
    cancelAnimation(autoScrollOffset);
    autoScrollOffset.value = scrollOffset.value;
    autoScrollActive.value = false;
    if (activeIndex.value < 0 || viewportHeight.value <= 0) return;
    const edgeSize = 60;
    const pointer = pointerViewportY.value;
    let velocity = 0;
    if (pointer < edgeSize && scrollOffset.value > 0) {
      velocity =
        -360 * Math.min(1, Math.max(0, (edgeSize - pointer) / edgeSize));
    } else if (pointer > viewportHeight.value - edgeSize) {
      velocity =
        360 *
        Math.min(
          1,
          Math.max(0, (pointer - (viewportHeight.value - edgeSize)) / edgeSize)
        );
    }
    if (velocity === 0) return;
    const maximumOffset = Math.max(
      0,
      contentLength(geometry.value) - viewportHeight.value
    );
    const target = velocity < 0 ? 0 : maximumOffset;
    if (target === scrollOffset.value) return;
    autoScrollActive.value = true;
    autoScrollOffset.value = withTiming(
      target,
      {
        duration:
          (Math.abs(target - scrollOffset.value) / Math.abs(velocity)) * 1000,
      },
      (finished) => {
        if (finished) autoScrollActive.value = false;
      }
    );
  }, [
    activeIndex,
    autoScrollActive,
    autoScrollOffset,
    geometry,
    pointerViewportY,
    scrollOffset,
    viewportHeight,
  ]);
  const frameLoopRef = useRef<FrameCallback | null>(null);
  const setFrameLoopActive = useCallback(
    (active: boolean) => frameLoopRef.current?.setActive(active),
    []
  );
  frameLoopRef.current = useFrameCallback(() => {
    'worklet';
    let queuePending = false;
    geometry.modify((current) => {
      const queue = measurementQueue.value;
      const validBatch = {
        cursor: 0,
        indices: [] as number[],
        lengths: [] as number[],
      };
      let consumed = 0;
      while (queue.cursor < queue.indices.length && consumed < 4) {
        const cursor = queue.cursor;
        const index = queue.indices[cursor]!;
        const id = queue.ids[cursor]!;
        if (uiItemIds.value[index] === id) {
          validBatch.indices.push(index);
          validBatch.lengths.push(queue.lengths[cursor]!);
        }
        queue.cursor += 1;
        consumed += 1;
      }
      const batch = applyMeasurementBatch(
        current,
        validBatch,
        activeIndex.value,
        4
      );
      anchorCorrection.value += batch.anchorDelta;
      if (queue.cursor === queue.indices.length && queue.cursor > 0) {
        queue.cursor = 0;
        queue.ids.length = 0;
        queue.indices.length = 0;
        queue.lengths.length = 0;
      }
      queuePending = queue.cursor < queue.indices.length;
      return current;
    }, true);
    if (activeIndex.value >= 0) {
      refreshDestination();
      updateAutoScroll();
    }
    if (!queuePending) scheduleOnRN(setFrameLoopActive, false);
  }, false);
  const handleMeasure = useCallback(
    (id: string, index: number, length: number) => {
      if (getItemLayout != null || !Number.isFinite(length) || length <= 0) {
        return;
      }
      setFrameLoopActive(true);
      scheduleOnUI(() => {
        'worklet';
        measurementQueue.modify((queue) => {
          queue.ids.push(id);
          queue.indices.push(index);
          queue.lengths.push(length);
          return queue;
        }, true);
      });
    },
    [getItemLayout, measurementQueue, setFrameLoopActive]
  );
  useAnimatedReaction(
    () => (autoScrollActive.value ? autoScrollOffset.value : null),
    (offset) => {
      if (offset == null) return;
      scrollOffset.value = offset;
      scrollTo(animatedListRef, 0, offset, false);
      refreshDestination();
    },
    [refreshDestination]
  );
  const viewportGestures = useMemo(() => {
    const nativeGesture = Gesture.Native();
    const reorderGesture = Gesture.LongPress()
      .withTestId('reorderable-list-viewport')
      .minDuration(350)
      .maxDistance(10_000)
      .cancelsTouchesInView(true)
      .onTouchesDown((event) => {
        const touch = event.allTouches[0];
        if (touch == null) return;
        gestureOriginX.value = touch.x;
        gestureOriginY.value = touch.y;
      })
      .onStart((event) => {
        'worklet';
        if (!enabled || viewportHeight.value <= 0) return;
        const index = indexAtOffset(
          geometry.value,
          scrollOffset.value + event.y
        ).index;
        const id = uiItemIds.value[index];
        if (id == null) return;
        gestureActivated.value = true;
        activeId.value = id;
        activeIndex.value = index;
        const sourceIndexes = uiSelectedIds.value.includes(id)
          ? uiItemIds.value
              .map((candidate, candidateIndex) =>
                uiSelectedIds.value.includes(candidate) ? candidateIndex : -1
              )
              .filter((candidateIndex) => candidateIndex >= 0)
          : [index];
        activeSourceIndexes.value = sourceIndexes;
        activeSourceIds.value = sourceIndexes.map(
          (sourceIndex) => uiItemIds.value[sourceIndex]!
        );
        interactionStartY.value = event.y;
        pointerViewportY.value = event.y;
        activeTranslationY.value = 0;
        anchorCorrection.value = 0;
        terminalSent.value = false;
        updateAutoScroll();
        refreshDestination();
      })
      .onTouchesMove((event, state) => {
        'worklet';
        const touch = event.allTouches[0];
        if (touch == null) return;
        if (
          !gestureActivated.value &&
          Math.hypot(
            touch.x - gestureOriginX.value,
            touch.y - gestureOriginY.value
          ) > LONG_PRESS_SLOP
        ) {
          state.fail();
          return;
        }
        if (gestureActivated.value && activeIndex.value >= 0) {
          pointerViewportY.value = touch.y;
          activeTranslationY.value = touch.y - interactionStartY.value;
          updateAutoScroll();
          refreshDestination();
        }
      })
      .onEnd((event) => {
        'worklet';
        if (activeIndex.value < 0 || terminalSent.value) return;
        pointerViewportY.value = event.y;
        activeTranslationY.value = event.y - interactionStartY.value;
        refreshDestination();
        const index = destinationIndex.value;
        const sourceIds = activeSourceIds.value;
        const beforeId = index < 0 ? null : (uiItemIds.value[index] ?? null);
        const cancelled =
          event.y < 0 || event.y > viewportHeight.value || index < 0;
        finishPointerInteraction(cancelled, sourceIds, beforeId);
      })
      .onFinalize((_event, success) => {
        'worklet';
        gestureActivated.value = false;
        if (!success) finishPointerInteraction(true, [], null);
      })
      .simultaneousWithExternalGesture(nativeGesture);
    nativeGesture.simultaneousWithExternalGesture(reorderGesture);
    return { nativeGesture, reorderGesture };
  }, [
    activeId,
    activeIndex,
    activeSourceIds,
    activeSourceIndexes,
    activeTranslationY,
    anchorCorrection,
    destinationIndex,
    enabled,
    geometry,
    gestureActivated,
    gestureOriginX,
    gestureOriginY,
    finishPointerInteraction,
    interactionStartY,
    pointerViewportY,
    refreshDestination,
    scrollOffset,
    terminalSent,
    uiItemIds,
    uiSelectedIds,
    updateAutoScroll,
    viewportHeight,
  ]);

  useEffect(() => {
    if (!enabled) cancel();
  }, [cancel, enabled]);
  useEffect(() => {
    scheduleOnUI(() => {
      'worklet';
      measurementQueue.value = { cursor: 0, ids: [], indices: [], lengths: [] };
      const previousGeometry = geometry.value;
      const previousIds = uiItemIds.value;
      const sameOrder =
        previousIds.length === itemIds.length &&
        previousIds.every((id, index) => id === itemIds[index]);
      let replacementGeometry = nextGeometry;
      if (
        !previousGeometry.exact &&
        !nextGeometry.exact &&
        sameOrder &&
        previousGeometry.estimate === nextGeometry.estimate &&
        previousGeometry.adaptive === nextGeometry.adaptive
      ) {
        replacementGeometry = previousGeometry;
      } else if (!nextGeometry.exact) {
        const nextIndexById: Record<string, number> = {};
        for (let index = 0; index < itemIds.length; index += 1) {
          nextIndexById[`identity:${itemIds[index]!}`] = index;
        }
        if (!previousGeometry.exact) {
          for (let index = 0; index < previousGeometry.count; index += 1) {
            if (previousGeometry.measuredFlags[index] !== 1) continue;
            const id = previousIds[index];
            const nextIndex =
              id == null ? null : nextIndexById[`identity:${id}`];
            if (nextIndex == null) continue;
            applyMeasurement(
              replacementGeometry,
              nextIndex,
              previousGeometry.measuredSizes[index]!
            );
          }
        }
      }
      if (activeIndex.value >= 0) {
        const nextActiveIndex =
          activeId.value == null ? -1 : itemIds.indexOf(activeId.value);
        const nextSourceIndexes = activeSourceIds.value
          .map((id) => itemIds.indexOf(id))
          .sort((left, right) => left - right);
        if (
          nextActiveIndex < 0 ||
          nextSourceIndexes.some((index) => index < 0)
        ) {
          finishPointerInteraction(true, [], null);
        } else {
          const previousAnchor = itemOffset(geometry.value, activeIndex.value);
          const nextAnchor = itemOffset(replacementGeometry, nextActiveIndex);
          anchorCorrection.value += nextAnchor - previousAnchor;
          activeIndex.value = nextActiveIndex;
          activeSourceIndexes.value = nextSourceIndexes;
        }
      }
      geometry.value = replacementGeometry;
      uiItemIds.value = itemIds;
      if (activeIndex.value >= 0) {
        refreshDestination();
        updateAutoScroll();
      }
    });
  }, [
    activeId,
    activeIndex,
    activeSourceIds,
    activeSourceIndexes,
    anchorCorrection,
    finishPointerInteraction,
    geometry,
    itemIds,
    measurementQueue,
    nextGeometry,
    uiItemIds,
    updateAutoScroll,
    refreshDestination,
  ]);
  useEffect(() => {
    scheduleOnUI(() => {
      'worklet';
      uiSelectedIds.value = selectedIds;
    });
  }, [selectedIds, uiSelectedIds]);
  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cancel();
    });
    const blur =
      Platform.OS === 'android'
        ? AppState.addEventListener('blur', cancel)
        : null;
    const back =
      Platform.OS === 'android'
        ? BackHandler.addEventListener('hardwareBackPress', () => {
            if (activeIndex.get() < 0) return false;
            cancel();
            return true;
          })
        : null;
    return () => {
      appState.remove();
      blur?.remove();
      back?.remove();
      cancel();
    };
  }, [activeIndex, cancel]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeight.value = event.nativeEvent.layout.height;
      onLayout?.(event);
    },
    [onLayout, viewportHeight]
  );
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffset.value = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll, scrollOffset]
  );
  const handleListRef = useCallback(
    (value: FlatList<Item> | ViewportRef | null) => {
      if (viewportAdapter == null) animatedListRef(value as FlatList<Item>);
      assignViewportRef(ref as Ref<unknown>, value);
    },
    [animatedListRef, ref, viewportAdapter]
  );
  const ownedScrollComponent = useOwnedAnimatedScrollComponent(animatedListRef);
  const accessibilityAvailability = useMemo(() => {
    const indexById = new Map(itemIds.map((id, index) => [id, index]));
    const selectedSet = new Set(selectedIds);
    const selectedIndexes = itemIds
      .map((id, index) => (selectedSet.has(id) ? index : -1))
      .filter((index) => index >= 0);
    const firstSelected = selectedIndexes[0] ?? -1;
    const lastSelected = selectedIndexes[selectedIndexes.length - 1] ?? -1;
    return (id: string, direction: 'earlier' | 'later') => {
      const index = indexById.get(id);
      if (index == null) return false;
      if (selectedSet.has(id)) {
        return direction === 'earlier'
          ? firstSelected > 0
          : lastSelected >= 0 && lastSelected < itemIds.length - 1;
      }
      return direction === 'earlier' ? index > 0 : index < itemIds.length - 1;
    };
  }, [itemIds, selectedIds]);
  const feedbackStyle = useAnimatedStyle(() => ({
    opacity: destinationIndex.value < 0 ? 0 : 1,
    transform: [{ translateY: feedbackViewportY.value }],
  }));
  const handleRenderItem = useCallback(
    ({ item, index }: { item: Item; index: number }) => {
      const id = keyExtractor(item, index);
      return (
        <ListCell
          activeSourceIndexes={activeSourceIndexes}
          activeTranslationY={activeTranslationY}
          anchorCorrection={anchorCorrection}
          id={id}
          index={index}
          item={item}
          renderItem={renderItem}
          onMeasure={handleMeasure}
          canMoveEarlier={enabled && accessibilityAvailability(id, 'earlier')}
          canMoveLater={enabled && accessibilityAvailability(id, 'later')}
          collectionSize={itemIds.length}
          moveEarlierLabel={resolvedAccessibilityStrings.moveEarlierAction}
          moveLaterLabel={resolvedAccessibilityStrings.moveLaterAction}
          onAccessibleMove={handleAccessibleMove}
          registerAccessibleRef={registerAccessibleRef}
        />
      );
    },
    [
      handleMeasure,
      handleAccessibleMove,
      activeSourceIndexes,
      activeTranslationY,
      anchorCorrection,
      accessibilityAvailability,
      enabled,
      itemIds,
      keyExtractor,
      renderItem,
      registerAccessibleRef,
      resolvedAccessibilityStrings,
    ]
  );

  const viewportProps: Record<string, unknown> = {
    ...flatListProps,
    data: data as Item[],
    keyExtractor,
    onLayout: handleLayout,
    onScroll: handleScroll,
    ref: handleListRef,
    renderItem: handleRenderItem,
    scrollEventThrottle,
  };
  if (viewportAdapter == null && getItemLayout != null) {
    viewportProps.getItemLayout = (_data: unknown, index: number) =>
      getItemLayout(data, index);
  }
  if (viewportAdapter != null) {
    viewportProps.maintainVisibleContentPosition = { disabled: true };
    viewportProps.renderScrollComponent = ownedScrollComponent;
  }
  const ViewportComponent = viewportAdapter?.component;
  const adaptedViewportProps =
    viewportAdapter?.createProps?.({
      data,
      estimatedItemSize,
      getItemLayout: getItemLayout as
        | ((data: readonly unknown[], index: number) => ReorderableItemLayout)
        | undefined,
      viewportProps,
    }) ?? viewportProps;
  const viewport = createElement(
    (ViewportComponent ?? Animated.FlatList) as ComponentType<
      Record<string, unknown>
    >,
    adaptedViewportProps
  );

  return (
    <View style={styles.viewportContainer}>
      <GestureDetector gesture={viewportGestures.reorderGesture}>
        <View collapsable={false} style={styles.gestureSurface}>
          <GestureDetector gesture={viewportGestures.nativeGesture}>
            {viewport}
          </GestureDetector>
        </View>
      </GestureDetector>
      <Animated.View
        pointerEvents="none"
        style={[styles.destinationFeedback, feedbackStyle]}
        testID="reorderable-list-destination-feedback"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  destinationFeedback: {
    backgroundColor: '#0A84FF',
    height: 3,
    left: 0,
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 3,
  },
  gestureSurface: {
    flex: 1,
  },
  viewportContainer: {
    flex: 1,
    position: 'relative',
  },
});
