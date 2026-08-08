import {
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
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
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

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
  VirtualizedReorderEngine,
  type VirtualizedReorderSnapshot,
} from './virtualized-reorder-engine';

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

function listGeometry<Item>(
  data: readonly Item[],
  getItemLayout:
    | ((data: readonly Item[], index: number) => ReorderableItemLayout)
    | undefined,
  estimatedItemSize: number | undefined,
  measuredItemSize: number | null
): readonly ReorderableItemLayout[] {
  const estimate = measuredItemSize ?? estimatedItemSize ?? 64;
  let offset = 0;
  return data.map((_item, index) => {
    const exact = getItemLayout?.(data, index);
    const length = exact?.length ?? estimate;
    const layout = exact ?? { index, length, offset };
    if (
      layout.index !== index ||
      !Number.isFinite(layout.length) ||
      layout.length <= 0 ||
      !Number.isFinite(layout.offset) ||
      layout.offset < 0
    ) {
      throw new Error(
        `[react-native-reorderable] ReorderableList getItemLayout returned invalid exact geometry for index ${index}.`
      );
    }
    offset = layout.offset + layout.length;
    return layout;
  });
}

function assignListRef<Item>(
  ref: Ref<FlatList<Item>> | undefined,
  value: FlatList<Item> | null
): void {
  if (typeof ref === 'function') ref(value);
  else if (ref != null) ref.current = value;
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
  active: boolean;
  id: string;
  item: Item;
  index: number;
  renderItem: (
    info: ReorderableListRenderItemInfo<Item>
  ) => ReactElement | null;
  translationY: number;
  onMeasure: (index: number, length: number) => void;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  moveEarlierLabel: string;
  moveLaterLabel: string;
  onAccessibleMove: (id: string, direction: 'earlier' | 'later') => void;
  registerAccessibleRef: (id: string, value: unknown) => void;
  collectionSize: number;
}>;

function ListCell<Item>({
  active,
  id,
  item,
  index,
  renderItem,
  translationY,
  onMeasure,
  canMoveEarlier,
  canMoveLater,
  moveEarlierLabel,
  moveLaterLabel,
  onAccessibleMove,
  registerAccessibleRef,
  collectionSize,
}: ListCellProps<Item>) {
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
    <View
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
      style={
        active
          ? [styles.activeItem, { transform: [{ translateY: translationY }] }]
          : undefined
      }
      onLayout={(event) => onMeasure(index, event.nativeEvent.layout.height)}
      ref={(value) => registerAccessibleRef(id, value)}
      testID={`reorderable-list-wrapper-${id}`}
    >
      {rendered}
    </View>
  );
}

type ReorderableListComponentProps<Item> = ReorderableListProps<Item> &
  RefAttributes<FlatList<Item>>;

export function ReorderableList<Item>(
  props: ReorderableListComponentProps<Item>
) {
  assertSupportedProps(props as unknown as Record<string, unknown>);
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
  const [measuredItemSize, setMeasuredItemSize] = useState<number | null>(null);
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
  const layouts = useMemo(
    () =>
      listGeometry(data, getItemLayout, estimatedItemSize, measuredItemSize),
    [data, estimatedItemSize, getItemLayout, measuredItemSize]
  );
  const listRef = useRef<FlatList<Item> | null>(null);
  const viewportHeight = useRef(0);
  const interactionStartY = useRef(0);
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
  const [snapshot, setSnapshot] = useState<VirtualizedReorderSnapshot>({
    active: false,
    autoScrollVelocity: 0,
    destination: null,
    feedbackViewportY: null,
    scrollOffset: 0,
    sourceIds: [],
  });
  const [translationY, setTranslationY] = useState(0);
  const gestureActivated = useSharedValue(false);
  const gestureOriginX = useSharedValue(0);
  const gestureOriginY = useSharedValue(0);
  const engineRef = useRef<VirtualizedReorderEngine | null>(null);
  if (engineRef.current == null) {
    engineRef.current = new VirtualizedReorderEngine({
      itemIds,
      layouts,
      onCommit: ({ sourceIds, destination }) => {
        const event = reconcileReorder(
          [{ sectionId: null, itemIds: currentItemIds.current }],
          sourceIds,
          destination
        );
        if (event != null) onReorderRef.current(event);
      },
    });
  }
  const reorderEngine = engineRef.current;
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopClock = useCallback(() => {
    if (autoScrollTimer.current == null) return;
    clearInterval(autoScrollTimer.current);
    autoScrollTimer.current = null;
  }, []);
  const publishSnapshot = useCallback(() => {
    setSnapshot(reorderEngine.snapshot());
  }, [reorderEngine]);
  const cancel = useCallback(() => {
    reorderEngine.cancel();
    stopClock();
    setTranslationY(0);
    publishSnapshot();
  }, [publishSnapshot, reorderEngine, stopClock]);
  const startClock = useCallback(() => {
    if (autoScrollTimer.current != null) return;
    autoScrollTimer.current = setInterval(() => {
      if (!reorderEngine.autoScrollTick(16)) {
        if (!reorderEngine.snapshot().active) stopClock();
        return;
      }
      const next = reorderEngine.snapshot();
      listRef.current?.scrollToOffset({
        animated: false,
        offset: next.scrollOffset,
      });
      setSnapshot(next);
    }, 16);
  }, [reorderEngine, stopClock]);
  const beginAt = useCallback(
    (viewportY: number) => {
      const contentY = reorderEngine.snapshot().scrollOffset + viewportY;
      const index = layouts.findIndex(
        (layout) =>
          contentY >= layout.offset && contentY <= layout.offset + layout.length
      );
      const id = itemIds[index];
      if (id == null) return;
      if (!enabled || !reorderEngine.start(id, selectedIdsRef.current)) return;
      interactionStartY.current = viewportY;
      setTranslationY(0);
      startClock();
      publishSnapshot();
    },
    [enabled, itemIds, layouts, publishSnapshot, reorderEngine, startClock]
  );
  const move = useCallback(
    (nextTranslationY: number) => {
      reorderEngine.move(nextTranslationY);
      setTranslationY(nextTranslationY);
      publishSnapshot();
    },
    [publishSnapshot, reorderEngine]
  );
  const moveTo = useCallback(
    (viewportY: number) => move(viewportY - interactionStartY.current),
    [move]
  );
  const finish = useCallback(
    (viewportY: number) => {
      const withinViewport =
        viewportY >= 0 && viewportY <= viewportHeight.current;
      reorderEngine.finish(withinViewport);
      stopClock();
      setTranslationY(0);
      publishSnapshot();
    },
    [publishSnapshot, reorderEngine, stopClock]
  );
  const finishAt = useCallback(
    (viewportY: number) => {
      moveTo(viewportY);
      finish(viewportY);
    },
    [finish, moveTo]
  );
  const handleMeasure = useCallback(
    (_index: number, length: number) => {
      if (getItemLayout != null || !Number.isFinite(length) || length <= 0) {
        return;
      }
      setMeasuredItemSize((current) => current ?? length);
    },
    [getItemLayout]
  );
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
        gestureActivated.value = true;
        scheduleOnRN(beginAt, event.y);
      })
      .onTouchesMove((event, state) => {
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
        if (gestureActivated.value) scheduleOnRN(moveTo, touch.y);
      })
      .onEnd((event) => scheduleOnRN(finishAt, event.y))
      .onFinalize((_event, success) => {
        gestureActivated.value = false;
        if (!success) scheduleOnRN(cancel);
      })
      .simultaneousWithExternalGesture(nativeGesture);
    nativeGesture.simultaneousWithExternalGesture(reorderGesture);
    return { nativeGesture, reorderGesture };
  }, [
    beginAt,
    cancel,
    finishAt,
    gestureActivated,
    gestureOriginX,
    gestureOriginY,
    moveTo,
  ]);

  useEffect(() => {
    if (!enabled) cancel();
  }, [cancel, enabled]);
  useEffect(() => {
    const wasActive = reorderEngine.snapshot().active;
    reorderEngine.updateGeometry(itemIds, layouts);
    if (!wasActive) return;
    if (!reorderEngine.snapshot().active) {
      stopClock();
      setTranslationY(0);
    }
    publishSnapshot();
  }, [itemIds, layouts, publishSnapshot, reorderEngine, stopClock]);
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
            if (!reorderEngine.snapshot().active) return false;
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
  }, [cancel, reorderEngine]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeight.current = event.nativeEvent.layout.height;
      reorderEngine.setViewport(
        event.nativeEvent.layout.height,
        reorderEngine.snapshot().scrollOffset
      );
      publishSnapshot();
      onLayout?.(event);
    },
    [onLayout, publishSnapshot, reorderEngine]
  );
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      reorderEngine.setScrollOffset(event.nativeEvent.contentOffset.y);
      if (reorderEngine.snapshot().active) publishSnapshot();
      onScroll?.(event);
    },
    [onScroll, publishSnapshot, reorderEngine]
  );
  const handleListRef = useCallback(
    (value: FlatList<Item> | null) => {
      listRef.current = value;
      assignListRef(ref, value);
    },
    [ref]
  );
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
  const handleRenderItem = useCallback(
    ({ item, index }: { item: Item; index: number }) => {
      const id = keyExtractor(item, index);
      return (
        <ListCell
          active={snapshot.sourceIds.includes(id)}
          id={id}
          index={index}
          item={item}
          renderItem={renderItem}
          translationY={translationY}
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
      accessibilityAvailability,
      enabled,
      itemIds,
      keyExtractor,
      renderItem,
      registerAccessibleRef,
      resolvedAccessibilityStrings,
      snapshot.sourceIds,
      translationY,
    ]
  );

  return (
    <View style={styles.viewportContainer}>
      <GestureDetector gesture={viewportGestures.reorderGesture}>
        <View collapsable={false} style={styles.gestureSurface}>
          <GestureDetector gesture={viewportGestures.nativeGesture}>
            <FlatList
              {...flatListProps}
              data={data as Item[]}
              getItemLayout={
                getItemLayout == null
                  ? undefined
                  : (_data, index) => getItemLayout(data, index)
              }
              keyExtractor={keyExtractor}
              onLayout={handleLayout}
              onScroll={handleScroll}
              ref={handleListRef}
              renderItem={handleRenderItem}
              scrollEventThrottle={scrollEventThrottle}
            />
          </GestureDetector>
        </View>
      </GestureDetector>
      {snapshot.feedbackViewportY == null ? null : (
        <View
          pointerEvents="none"
          style={[
            styles.destinationFeedback,
            { top: snapshot.feedbackViewportY },
          ]}
          testID="reorderable-list-destination-feedback"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  activeItem: {
    elevation: 8,
    opacity: 0.94,
    zIndex: 2,
  },
  destinationFeedback: {
    backgroundColor: '#0A84FF',
    height: 3,
    left: 0,
    position: 'absolute',
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
