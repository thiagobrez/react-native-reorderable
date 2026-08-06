/**
 * PROTOTYPE — issue #17. Throw this screen away after setting the v1 budget.
 *
 * Question: how close can the minimum credible windowed fallback scaffold stay
 * to a plain FlatList while keeping destination lookup and auto-scroll off JS?
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
  InteractionManager,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  runOnUI,
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

type Mode = 'flatlist' | 'fallback';
type Row = Readonly<{ height: number; id: string; label: string }>;
type BenchmarkResult = Readonly<{
  destination: number;
  lookupSteps: number;
  uiUpdates: number;
}>;

const DATASET_SIZES = [100, 1_000, 10_000] as const;
const ESTIMATED_HEIGHT = 64;
const SEPARATOR_HEIGHT = 1;
const ESTIMATED_STRIDE = ESTIMATED_HEIGHT + SEPARATOR_HEIGHT;
const EDGE_ZONE = 72;
const AUTO_SCROLL_STEP = 9;
const HEIGHT_PATTERN = [48, 64, 80, 56, 96, 72, 52, 88] as const;

let cellRenderCount = 0;
let cellMountCount = 0;

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    height: HEIGHT_PATTERN[index % HEIGHT_PATTERN.length] ?? ESTIMATED_HEIGHT,
    id: `row-${index}`,
    label: `Row ${index}`,
  }));
}

function prefixCorrection(tree: readonly number[], itemCount: number) {
  'worklet';
  let cursor = itemCount;
  let sum = 0;
  while (cursor > 0) {
    sum += tree[cursor] ?? 0;
    // Fenwick-tree parent traversal.
    // eslint-disable-next-line no-bitwise
    cursor -= cursor & -cursor;
  }
  return sum;
}

function estimatedTop(tree: readonly number[], index: number) {
  'worklet';
  return index * ESTIMATED_STRIDE + prefixCorrection(tree, index);
}

function destinationForOffset(
  tree: readonly number[],
  itemCount: number,
  offset: number
) {
  'worklet';
  let low = 0;
  let high = itemCount;
  let steps = 0;
  while (low < high) {
    steps += 1;
    const middle = Math.floor((low + high) / 2);
    if (estimatedTop(tree, middle) < offset) low = middle + 1;
    else high = middle;
  }
  return { index: Math.max(0, Math.min(itemCount, low)), steps };
}

function applyMeasurement(
  index: number,
  height: number,
  measuredHeights: SharedValue<number[]>,
  correctionTree: SharedValue<number[]>
) {
  'worklet';
  const previous = measuredHeights.value[index] ?? ESTIMATED_HEIGHT;
  if (Math.abs(previous - height) < 0.5) return;

  const nextHeights = measuredHeights.value.slice();
  nextHeights[index] = height;
  measuredHeights.value = nextHeights;

  const nextTree = correctionTree.value.slice();
  const delta = height - previous;
  let cursor = index + 1;
  while (cursor < nextTree.length) {
    nextTree[cursor] = (nextTree[cursor] ?? 0) + delta;
    // Fenwick-tree child traversal.
    // eslint-disable-next-line no-bitwise
    cursor += cursor & -cursor;
  }
  correctionTree.value = nextTree;
}

function move<T>(values: readonly T[], from: number, to: number): T[] {
  const next = [...values];
  const [item] = next.splice(from, 1);
  if (item !== undefined) {
    const insertion = to > from ? to - 1 : to;
    next.splice(Math.max(0, Math.min(next.length, insertion)), 0, item);
  }
  return next;
}

const PlainRow = memo(function PlainRowCell({ row }: { row: Row }) {
  cellRenderCount += 1;
  useEffect(() => {
    cellMountCount += 1;
  }, []);

  return (
    <View
      accessibilityLabel={row.label}
      style={[styles.row, { height: row.height }]}
      testID={row.id}
    >
      <Text style={styles.rowLabel}>{row.label}</Text>
      <Text style={styles.rowHeight}>{row.height}pt</Text>
    </View>
  );
});

const FallbackRow = memo(function FallbackRowCell({
  correctionTree,
  index,
  itemCount,
  listRef,
  measuredHeights,
  onCommit,
  onResult,
  row,
  scrollOffset,
  viewportHeight,
  viewportTop,
}: {
  correctionTree: SharedValue<number[]>;
  index: number;
  itemCount: number;
  listRef: AnimatedRef<Animated.FlatList<Row>>;
  measuredHeights: SharedValue<number[]>;
  onCommit: (from: number, to: number) => void;
  onResult: (result: BenchmarkResult) => void;
  row: Row;
  scrollOffset: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  viewportTop: SharedValue<number>;
}) {
  cellRenderCount += 1;
  useEffect(() => {
    cellMountCount += 1;
  }, []);

  const dragging = useSharedValue(false);
  const translation = useSharedValue(0);
  const destination = useSharedValue(index);
  const uiUpdates = useSharedValue(0);
  const lookupSteps = useSharedValue(0);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(220)
        .onBegin(() => {
          dragging.value = true;
          translation.value = 0;
          destination.value = index;
          uiUpdates.value = 0;
          lookupSteps.value = 0;
        })
        .onUpdate((event) => {
          translation.value = event.translationY;
          uiUpdates.value += 1;

          const pointerOffset =
            scrollOffset.value +
            estimatedTop(correctionTree.value, index) +
            event.translationY +
            (measuredHeights.value[index] ?? ESTIMATED_HEIGHT) / 2;
          const lookup = destinationForOffset(
            correctionTree.value,
            itemCount,
            pointerOffset
          );
          destination.value = lookup.index;
          lookupSteps.value = Math.max(lookupSteps.value, lookup.steps);

          const localPointer = event.absoluteY - viewportTop.value;
          if (localPointer < EDGE_ZONE) {
            scrollOffset.value = Math.max(
              0,
              scrollOffset.value - AUTO_SCROLL_STEP
            );
            scrollTo(listRef, 0, scrollOffset.value, false);
          } else if (localPointer > viewportHeight.value - EDGE_ZONE) {
            scrollOffset.value += AUTO_SCROLL_STEP;
            scrollTo(listRef, 0, scrollOffset.value, false);
          }
        })
        .onFinalize(() => {
          const target = destination.value;
          dragging.value = false;
          translation.value = 0;
          runOnJS(onResult)({
            destination: target,
            lookupSteps: lookupSteps.value,
            uiUpdates: uiUpdates.value,
          });
          if (target !== index && target !== index + 1) {
            runOnJS(onCommit)(index, target);
          }
        }),
    [
      correctionTree,
      destination,
      dragging,
      index,
      itemCount,
      listRef,
      lookupSteps,
      measuredHeights,
      onCommit,
      onResult,
      scrollOffset,
      translation,
      uiUpdates,
      viewportHeight,
      viewportTop,
    ]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: dragging.value ? 0.82 : 1,
    transform: [{ translateY: translation.value }],
    zIndex: dragging.value ? 3 : 0,
  }));

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      runOnUI(applyMeasurement)(
        index,
        event.nativeEvent.layout.height,
        measuredHeights,
        correctionTree
      );
    },
    [correctionTree, index, measuredHeights]
  );

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessibilityLabel={row.label}
        onLayout={handleLayout}
        style={[styles.row, { height: row.height }, animatedStyle]}
        testID={row.id}
      >
        <Text style={styles.rowLabel}>{row.label}</Text>
        <Text style={styles.rowHeight}>{row.height}pt</Text>
      </Animated.View>
    </GestureDetector>
  );
});

function RowSeparator() {
  return <View style={styles.separator} />;
}

function BenchmarkList({ mode, size }: { mode: Mode; size: number }) {
  const startedAt = useRef(Date.now());
  const [rows, setRows] = useState(() => makeRows(size));
  const [settleMs, setSettleMs] = useState<number | null>(null);
  const [sampled, setSampled] = useState(false);
  const [visibleRows, setVisibleRows] = useState(0);
  const [lastResult, setLastResult] = useState<BenchmarkResult | null>(null);
  const viewportRef = useRef<ComponentRef<typeof View>>(null);
  const animatedRef = useAnimatedRef<Animated.FlatList<Row>>();
  const correctionTree = useSharedValue(Array(size + 1).fill(0));
  const measuredHeights = useSharedValue(Array(size).fill(ESTIMATED_HEIGHT));
  const scrollOffset = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const viewportTop = useSharedValue(0);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => setSettleMs(Date.now() - startedAt.current));
    });
    const timer = setTimeout(() => setSampled(true), 750);
    return () => {
      task.cancel();
      clearTimeout(timer);
    };
  }, []);

  const commit = useCallback((from: number, to: number) => {
    setRows((current) => move(current, from, to));
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffset.value = event.nativeEvent.contentOffset.y;
    },
    [scrollOffset]
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height, y } = event.nativeEvent.layout;
      viewportHeight.value = height;
      viewportTop.value = y;
      requestAnimationFrame(() => {
        viewportRef.current?.measure(
          (_x, _y, _width, measuredHeight, _pageX, pageY) => {
            viewportHeight.value = measuredHeight;
            viewportTop.value = pageY;
          }
        );
      });
    },
    [viewportHeight, viewportTop]
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Row>) => {
      if (mode === 'flatlist') return <PlainRow row={item} />;
      return (
        <FallbackRow
          correctionTree={correctionTree}
          index={index}
          itemCount={rows.length}
          listRef={animatedRef}
          measuredHeights={measuredHeights}
          onCommit={commit}
          onResult={setLastResult}
          row={item}
          scrollOffset={scrollOffset}
          viewportHeight={viewportHeight}
          viewportTop={viewportTop}
        />
      );
    },
    [
      commit,
      correctionTree,
      animatedRef,
      measuredHeights,
      mode,
      rows.length,
      scrollOffset,
      viewportHeight,
      viewportTop,
    ]
  );

  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: readonly unknown[] }) => {
      setVisibleRows(viewableItems.length);
    }
  ).current;

  return (
    <View style={styles.listSection}>
      <View style={styles.metrics} testID="benchmark-readout">
        <Text style={styles.metricText}>
          ready · {mode} · {size.toLocaleString()} rows
        </Text>
        <Text style={styles.metricDim}>
          settle {settleMs ?? '…'}ms · {sampled ? 'sampled' : 'warming'} ·
          visible {visibleRows} · mounts {cellMountCount} · renders{' '}
          {cellRenderCount}
        </Text>
        <Text style={styles.metricDim} testID="drag-readout">
          drag{' '}
          {lastResult
            ? `${lastResult.uiUpdates} UI updates · ≤${lastResult.lookupSteps} lookup steps · destination ${lastResult.destination}`
            : 'not sampled'}
        </Text>
      </View>

      <View ref={viewportRef} style={styles.listViewport}>
        <Animated.FlatList
          data={rows}
          initialNumToRender={12}
          ItemSeparatorComponent={RowSeparator}
          keyExtractor={(item) => item.id}
          maxToRenderPerBatch={10}
          onLayout={handleLayout}
          onScroll={handleScroll}
          onViewableItemsChanged={handleViewableItemsChanged}
          ref={animatedRef}
          removeClippedSubviews
          renderItem={renderItem}
          scrollEventThrottle={16}
          testID="benchmark-list"
          windowSize={5}
        />
      </View>
    </View>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>('flatlist');
  const [size, setSize] = useState<number>(1_000);
  const [run, setRun] = useState(0);

  const choose = (nextMode: Mode, nextSize: number) => {
    cellRenderCount = 0;
    cellMountCount = 0;
    setMode(nextMode);
    setSize(nextSize);
    setRun((current) => current + 1);
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>PROTOTYPE · ISSUE 17</Text>
        <Text style={styles.title}>Fallback budget bench</Text>
        <Text style={styles.subtitle}>
          Plain FlatList vs minimum windowed reorder scaffolding
        </Text>
      </View>

      <View style={styles.controls}>
        {(['flatlist', 'fallback'] as const).map((candidate) => (
          <Pressable
            accessibilityState={{ selected: mode === candidate }}
            key={candidate}
            onPress={() => choose(candidate, size)}
            style={[styles.control, mode === candidate && styles.controlActive]}
            testID={`mode-${candidate}`}
          >
            <Text style={styles.controlText}>
              {candidate === 'flatlist' ? 'FlatList' : 'Fallback'}
            </Text>
          </Pressable>
        ))}
        {DATASET_SIZES.map((candidate) => (
          <Pressable
            accessibilityState={{ selected: size === candidate }}
            key={candidate}
            onPress={() => choose(mode, candidate)}
            style={[styles.control, size === candidate && styles.controlActive]}
            testID={`size-${candidate}`}
          >
            <Text style={styles.controlText}>
              {candidate >= 1_000 ? `${candidate / 1_000}k` : candidate}
            </Text>
          </Pressable>
        ))}
      </View>

      <BenchmarkList key={`${mode}-${size}-${run}`} mode={mode} size={size} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#090B10', flex: 1, paddingTop: 54 },
  header: { paddingHorizontal: 16 },
  eyebrow: {
    color: '#7D8BA1',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: { color: '#F4F7FB', fontSize: 25, fontWeight: '800' },
  subtitle: { color: '#8B96A8', fontSize: 11, marginTop: 2 },
  controls: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  control: {
    backgroundColor: '#171B24',
    borderColor: '#252B38',
    borderRadius: 7,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 7,
  },
  controlActive: { borderColor: '#65D6AD' },
  controlText: {
    color: '#D8DEE9',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  listSection: { flex: 1 },
  listViewport: { flex: 1 },
  metrics: {
    backgroundColor: '#10141C',
    borderBottomColor: '#252B38',
    borderBottomWidth: 1,
    borderTopColor: '#252B38',
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  metricText: { color: '#65D6AD', fontFamily: 'Menlo', fontSize: 10 },
  metricDim: { color: '#8893A5', fontFamily: 'Menlo', fontSize: 9 },
  row: {
    alignItems: 'center',
    backgroundColor: '#171D28',
    borderLeftColor: '#65D6AD',
    borderLeftWidth: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  rowLabel: { color: '#E7ECF4', fontSize: 13, fontWeight: '600' },
  rowHeight: { color: '#68758A', fontFamily: 'Menlo', fontSize: 9 },
  separator: { backgroundColor: '#090B10', height: SEPARATOR_HEIGHT },
});
