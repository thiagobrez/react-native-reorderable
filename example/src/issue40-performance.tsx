import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  type ReorderableListPerformanceSample,
  type ReorderableListRuntime,
} from '../../src/reorderable-list';
import { ReorderableList } from 'react-native-reorderable';

export type Issue40PerformanceMode = 'control' | 'fallback';

type Row = Readonly<{ id: string; label: string }>;
type RenderMetrics = Readonly<{
  mountedCells: number;
  renderedCells: number;
  settleMs: number;
}>;

const ROW_COUNT = 10_000;
const ROW_HEIGHT = 52;
const PerformanceReorderableList =
  ReorderableList as typeof ReorderableListRuntime;

class RenderTracker {
  private readonly mounted = new Set<string>();
  private renderCount = 0;
  private readonly startedAt = performance.now();
  private settled = false;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private listener: ((metrics: RenderMetrics) => void) | null = null;

  recordRender() {
    if (this.settled) return;
    this.renderCount += 1;
    this.scheduleSettle();
  }

  recordMount(id: string) {
    this.mounted.add(id);
    this.scheduleSettle();
    return () => {
      this.mounted.delete(id);
    };
  }

  subscribe(listener: (metrics: RenderMetrics) => void) {
    this.listener = listener;
    this.scheduleSettle();
    return () => {
      this.listener = null;
      if (this.settleTimer != null) clearTimeout(this.settleTimer);
      this.settleTimer = null;
    };
  }

  private scheduleSettle() {
    if (this.settled) return;
    if (this.settleTimer != null) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.settled = true;
      this.listener?.({
        mountedCells: this.mounted.size,
        renderedCells: this.renderCount,
        settleMs: performance.now() - this.startedAt,
      });
    }, 120);
  }
}

function PerformanceRow({
  item,
  tracker,
}: {
  item: Row;
  tracker: RenderTracker;
}) {
  tracker.recordRender();
  useEffect(() => tracker.recordMount(item.id), [item.id, tracker]);
  return (
    <View
      accessible
      accessibilityLabel={item.label}
      style={styles.row}
      testID={`issue40-${item.id}`}
    >
      <Text style={styles.rowText}>{item.label}</Text>
    </View>
  );
}

export function parseIssue40PerformanceLink(
  url: string
): Issue40PerformanceMode | null {
  const match = /^reorderable:\/\/performance\/(control|fallback)$/.exec(url);
  return match?.[1] === 'control' || match?.[1] === 'fallback'
    ? match[1]
    : null;
}

export function Issue40PerformanceHarness({
  mode,
  onBack,
  onModeChange,
}: {
  mode: Issue40PerformanceMode;
  onBack: () => void;
  onModeChange: (mode: Issue40PerformanceMode) => void;
}) {
  const tracker = useMemo(() => new RenderTracker(), []);
  const rows = useMemo<readonly Row[]>(
    () =>
      Array.from({ length: ROW_COUNT }, (_, index) => ({
        id: `performance-${index}`,
        label: `Performance row ${index + 1}`,
      })),
    []
  );
  const [renderMetrics, setRenderMetrics] = useState<RenderMetrics | null>(
    null
  );
  const [gestureMetrics, setGestureMetrics] =
    useState<ReorderableListPerformanceSample | null>(null);
  const [reorderCommits, setReorderCommits] = useState(0);
  useEffect(() => tracker.subscribe(setRenderMetrics), [tracker]);
  const renderItem = useCallback(
    ({ item }: { item: Row }) => (
      <PerformanceRow item={item} tracker={tracker} />
    ),
    [tracker]
  );
  const performanceProbe = useMemo(
    () => ({ onGestureTerminal: setGestureMetrics }),
    []
  );
  const listProps = {
    data: rows,
    getItemLayout: (
      _data: ArrayLike<Row> | null | undefined,
      index: number
    ) => ({
      index,
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
    }),
    initialNumToRender: 10,
    keyExtractor: (item: Row) => item.id,
    maxToRenderPerBatch: 10,
    removeClippedSubviews: true,
    renderItem,
    style: styles.list,
    windowSize: 5,
  } as const;
  const visibleMetrics = {
    mode,
    rowCount: ROW_COUNT,
    ready: renderMetrics != null,
    ...renderMetrics,
    gesture: gestureMetrics,
    reorderCommits,
  };

  return (
    <View style={styles.page} testID="issue40-performance-harness">
      <Pressable
        accessibilityLabel="Back to Scenario Lab"
        accessibilityRole="button"
        onPress={onBack}
        testID="issue40-performance-back"
      >
        <Text style={styles.subtitle}>‹ Scenario Lab</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>
        Issue 40 physical performance
      </Text>
      <Text style={styles.subtitle}>Mode: {mode}</Text>
      <View style={styles.modeRow}>
        {(['control', 'fallback'] as const).map((candidate) => (
          <Pressable
            accessibilityLabel={`${candidate} performance mode`}
            accessibilityRole="button"
            key={candidate}
            onPress={() => onModeChange(candidate)}
            style={styles.mode}
            testID={`issue40-mode-${candidate}`}
          >
            <Text style={styles.modeText}>{candidate}</Text>
          </Pressable>
        ))}
      </View>
      <Text
        accessibilityLabel={`Issue 40 performance metrics ${JSON.stringify(visibleMetrics)}`}
        selectable
        style={styles.metrics}
        testID="issue40-performance-metrics"
      >
        {JSON.stringify(visibleMetrics)}
      </Text>
      {mode === 'control' ? (
        <FlatList {...listProps} testID="issue40-control-list" />
      ) : (
        <PerformanceReorderableList
          {...listProps}
          __performanceProbe={performanceProbe}
          engine="fallback"
          onReorder={() => setReorderCommits((count) => count + 1)}
          testID="issue40-fallback-list"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  metrics: { color: '#d7e2ff', fontSize: 11, marginBottom: 8 },
  mode: { backgroundColor: '#263967', flex: 1, padding: 8 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  modeText: { color: '#ffffff', textAlign: 'center' },
  page: { backgroundColor: '#10172a', flex: 1, padding: 16 },
  row: {
    alignItems: 'center',
    backgroundColor: '#e8edff',
    borderBottomColor: '#b8c4e8',
    borderBottomWidth: StyleSheet.hairlineWidth,
    height: ROW_HEIGHT,
    justifyContent: 'center',
  },
  rowText: { color: '#10172a', fontSize: 16 },
  subtitle: { color: '#9fb3e8', marginBottom: 8 },
  title: { color: '#ffffff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
});
