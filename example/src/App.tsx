/**
 * PROTOTYPE — issue #7. Throw this screen away after the feasibility decision.
 *
 * Two engines render the same heterogeneous collection. Drag the same row to the
 * same visual destination in each column, then compare the orders and event log.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  ReorderableContainer,
  ReorderableItem,
  type ReorderMove,
} from 'react-native-reorderable';

type Card = Readonly<{
  color: string;
  height: number;
  id: string;
  label: string;
}>;

type Measurement = Readonly<{ height: number; top: number }>;
type Measurements = Readonly<Record<string, Measurement>>;

const GAP = 6;
const cards: readonly Card[] = [
  { id: 'blue', label: 'Blue', color: '#0A84FF', height: 46 },
  { id: 'green', label: 'Green', color: '#30D158', height: 72 },
  { id: 'yellow', label: 'Yellow', color: '#FFD60A', height: 54 },
  { id: 'orange', label: 'Orange', color: '#FF9F0A', height: 86 },
  { id: 'pink', label: 'Pink', color: '#FF375F', height: 50 },
];
const initialOrder = cards.map(({ id }) => id);

function move<T>(values: readonly T[], from: number, to: number): T[] {
  const next = [...values];
  const [value] = next.splice(from, 1);
  if (value !== undefined) next.splice(to, 0, value);
  return next;
}

function orderLabel(order: readonly string[]) {
  return order.map((id) => id.slice(0, 1).toUpperCase()).join(' · ');
}

function positionsFor(
  order: readonly string[],
  heights: Readonly<Record<string, number>>
): Measurements {
  let top = 0;
  const result: Record<string, Measurement> = {};
  for (const id of order) {
    const height = heights[id] ?? 54;
    result[id] = { height, top };
    top += height + GAP;
  }
  return result;
}

function FallbackRow({
  card,
  measurement,
  onDragCenter,
  onDragEnd,
  onDragStart,
  onMeasure,
}: {
  card: Card;
  measurement: Measurement;
  onDragCenter: (id: string, center: number) => void;
  onDragEnd: (id: string) => void;
  onDragStart: (id: string) => void;
  onMeasure: (id: string, height: number) => void;
}) {
  const desiredTop = useSharedValue(measurement.top);
  const dragTop = useSharedValue(measurement.top);
  const startTop = useSharedValue(measurement.top);
  const dragging = useSharedValue(false);

  useEffect(() => {
    desiredTop.value = measurement.top;
  }, [desiredTop, measurement.top]);

  const reportStart = useCallback(
    () => onDragStart(card.id),
    [card.id, onDragStart]
  );
  const reportCenter = useCallback(
    (center: number) => onDragCenter(card.id, center),
    [card.id, onDragCenter]
  );
  const reportEnd = useCallback(() => onDragEnd(card.id), [card.id, onDragEnd]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(220)
        .onBegin(() => {
          startTop.value = desiredTop.value;
          dragTop.value = startTop.value;
          dragging.value = true;
          runOnJS(reportStart)();
        })
        .onUpdate((event) => {
          const top = startTop.value + event.translationY;
          dragTop.value = top;
          runOnJS(reportCenter)(top + measurement.height / 2);
        })
        .onFinalize(() => {
          dragging.value = false;
          runOnJS(reportEnd)();
        }),
    [
      desiredTop,
      dragTop,
      dragging,
      measurement.height,
      reportCenter,
      reportEnd,
      reportStart,
      startTop,
    ]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    top: dragging.value
      ? dragTop.value
      : withSpring(desiredTop.value, { damping: 20, stiffness: 220 }),
    transform: [{ scale: withSpring(dragging.value ? 1.035 : 1) }],
    zIndex: dragging.value ? 2 : 1,
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    onMeasure(card.id, event.nativeEvent.layout.height);
  };

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessibilityLabel={`Fallback ${card.label} card`}
        onLayout={handleLayout}
        style={[
          styles.card,
          styles.fallbackCard,
          { backgroundColor: card.color, height: card.height },
          animatedStyle,
        ]}
        testID={`fallback-${card.id}`}
      >
        <Text style={styles.cardLabel}>{card.label}</Text>
        <Text style={styles.heightLabel}>
          {Math.round(measurement.height)}pt
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}

function FallbackEngine({
  autoResize,
  cardHeights,
  onOrderChange,
  onTrace,
  order,
  setTall,
}: {
  autoResize: boolean;
  cardHeights: Readonly<Record<string, number>>;
  onOrderChange: (order: readonly string[]) => void;
  onTrace: (message: string) => void;
  order: readonly string[];
  setTall: (tall: boolean) => void;
}) {
  const [measuredHeights, setMeasuredHeights] = useState(cardHeights);
  const dragBaseOrderRef = useRef(order);
  const orderRef = useRef(order);
  const measurements = positionsFor(order, measuredHeights);
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  orderRef.current = order;

  const handleMeasure = useCallback(
    (id: string, height: number) => {
      setMeasuredHeights((current) => {
        if (Math.abs((current[id] ?? 0) - height) < 0.5) return current;
        onTrace(`measured ${id} at ${Math.round(height)}pt`);
        return { ...current, [id]: height };
      });
    },
    [onTrace]
  );

  const handleDragStart = useCallback(
    (id: string) => {
      dragBaseOrderRef.current = orderRef.current;
      onTrace(`fallback began ${id}`);
      if (autoResize) {
        resizeTimer.current = setTimeout(() => {
          setTall(true);
          onTrace('yellow resized while drag was active');
        }, 600);
      }
    },
    [autoResize, onTrace, setTall]
  );

  const handleDragCenter = useCallback(
    (id: string, center: number) => {
      const current = orderRef.current;
      const from = current.indexOf(id);
      if (from < 0) return;
      const baseOrder = dragBaseOrderRef.current;
      const baseMeasurements = positionsFor(baseOrder, measuredHeights);
      const to = baseOrder
        .filter((candidateId) => candidateId !== id)
        .filter((candidateId) => {
          const candidate = baseMeasurements[candidateId];
          return candidate && center > candidate.top + candidate.height / 2;
        }).length;
      if (from === to) return;
      const next = move(current, from, to);
      orderRef.current = next;
      onOrderChange(next);
      onTrace(
        `fallback center ${Math.round(center)}pt crossed into index ${to}`
      );
    },
    [measuredHeights, onOrderChange, onTrace]
  );

  const handleDragEnd = useCallback(
    (id: string) => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      onTrace(`fallback dropped ${id} → ${orderLabel(orderRef.current)}`);
    },
    [onTrace]
  );

  const height = Object.values(measuredHeights).reduce(
    (total, itemHeight) => total + itemHeight + GAP,
    -GAP
  );

  return (
    <View
      style={[styles.fallbackContainer, { height }]}
      testID="fallback-container"
    >
      {order.map((id) => {
        const card = cards.find((candidate) => candidate.id === id)!;
        return (
          <FallbackRow
            card={{ ...card, height: cardHeights[id] ?? card.height }}
            key={id}
            measurement={measurements[id] ?? { height: card.height, top: 0 }}
            onDragCenter={handleDragCenter}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            onMeasure={handleMeasure}
          />
        );
      })}
    </View>
  );
}

export default function App() {
  const [nativeOrder, setNativeOrder] =
    useState<readonly string[]>(initialOrder);
  const [fallbackOrder, setFallbackOrder] =
    useState<readonly string[]>(initialOrder);
  const [autoResize, setAutoResize] = useState(false);
  const [tall, setTall] = useState(false);
  const [trace, setTrace] = useState<readonly string[]>([
    'Ready — hold, then drag the same card in each column.',
  ]);
  const cardHeights = useMemo(
    () =>
      Object.fromEntries(
        cards.map((card) => [
          card.id,
          card.id === 'yellow' && tall ? 104 : card.height,
        ])
      ),
    [tall]
  );
  const addTrace = useCallback((message: string) => {
    setTrace((current) => [message, ...current].slice(0, 4));
  }, []);

  const handleNativeMove = (event: ReorderMove) => {
    const next = event.nextOrder[0]?.itemIds;
    if (!next) return;
    setNativeOrder(next);
    addTrace(`native dropped → ${orderLabel(next)}`);
  };

  const reset = () => {
    setNativeOrder(initialOrder);
    setFallbackOrder(initialOrder);
    setTall(false);
    setTrace(['Reset — both engines have the same source order.']);
  };

  const matching = nativeOrder.join() === fallbackOrder.join();

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>THROWAWAY PROTOTYPE · ISSUE 7</Text>
          <Text style={styles.title}>Native vs fallback</Text>
        </View>
        <Pressable onPress={reset} style={styles.button} testID="reset">
          <Text style={styles.buttonText}>Reset</Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityState={{ checked: autoResize }}
        onPress={() => {
          setAutoResize((current) => !current);
          setTall(false);
        }}
        style={[styles.resizeToggle, autoResize && styles.resizeToggleActive]}
        testID="auto-resize"
      >
        <Text style={styles.resizeToggleText}>
          Resize yellow 600ms into fallback drag: {autoResize ? 'ON' : 'OFF'}
        </Text>
      </Pressable>

      <View style={styles.columns}>
        <View style={styles.column}>
          <Text style={styles.columnTitle}>SwiftUI native</Text>
          <Text style={styles.order} testID="native-order">
            {orderLabel(nativeOrder)}
          </Text>
          <ReorderableContainer
            accessibilityLabel="Native reorder probe"
            onMove={handleNativeMove}
            style={styles.nativeContainer}
            testID="native-container"
          >
            {nativeOrder.map((id) => {
              const card = cards.find((candidate) => candidate.id === id)!;
              return (
                <ReorderableItem
                  accessibilityLabel={`Native ${card.label} card`}
                  id={id}
                  key={id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: card.color,
                      height: cardHeights[id] ?? card.height,
                    },
                  ]}
                  testID={`native-${id}`}
                >
                  <Text style={styles.cardLabel}>{card.label}</Text>
                  <Text style={styles.heightLabel}>
                    {cardHeights[id] ?? card.height}pt
                  </Text>
                </ReorderableItem>
              );
            })}
          </ReorderableContainer>
        </View>

        <View style={styles.column}>
          <Text style={styles.columnTitle}>Reanimated + GH</Text>
          <Text style={styles.order} testID="fallback-order">
            {orderLabel(fallbackOrder)}
          </Text>
          <FallbackEngine
            autoResize={autoResize}
            cardHeights={cardHeights}
            onOrderChange={setFallbackOrder}
            onTrace={addTrace}
            order={fallbackOrder}
            setTall={setTall}
          />
        </View>
      </View>

      <View style={styles.readout}>
        <Text
          style={[styles.match, matching ? styles.matchYes : styles.matchNo]}
          testID="match-readout"
        >
          FINAL ORDERS: {matching ? 'MATCH' : 'DIFFER'}
        </Text>
        {trace.map((message, index) => (
          <Text
            key={`${message}-${index}`}
            numberOfLines={1}
            style={styles.trace}
          >
            {message}
          </Text>
        ))}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#08090B',
    paddingHorizontal: 12,
    paddingTop: 64,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  eyebrow: {
    color: '#8E8E93',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  button: {
    backgroundColor: '#2C2C2E',
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  buttonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  resizeToggle: {
    backgroundColor: '#1C1C1E',
    borderColor: '#3A3A3C',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 9,
  },
  resizeToggleActive: { borderColor: '#FFD60A' },
  resizeToggleText: { color: '#D1D1D6', fontSize: 11, textAlign: 'center' },
  columns: { flexDirection: 'row', gap: 8 },
  column: { flex: 1 },
  columnTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  order: {
    color: '#8E8E93',
    fontSize: 9,
    marginBottom: 7,
    marginTop: 3,
    textAlign: 'center',
  },
  nativeContainer: { gap: GAP, width: '100%' },
  fallbackContainer: { position: 'relative', width: '100%' },
  card: {
    alignItems: 'center',
    borderRadius: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 9,
    width: '100%',
  },
  fallbackCard: { left: 0, position: 'absolute' },
  cardLabel: { color: '#08090B', fontSize: 11, fontWeight: '800' },
  heightLabel: { color: '#08090B99', fontSize: 9, fontWeight: '700' },
  readout: {
    backgroundColor: '#141416',
    borderRadius: 10,
    marginTop: 14,
    padding: 10,
  },
  match: { fontSize: 11, fontWeight: '800', marginBottom: 4 },
  matchYes: { color: '#30D158' },
  matchNo: { color: '#FF453A' },
  trace: { color: '#AEAEB2', fontFamily: 'Menlo', fontSize: 8, lineHeight: 12 },
});
