import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import {
  ReorderableContainer,
  ReorderableItem,
  ReorderableList,
  ReorderableSectionList,
  type EnginePolicy,
  type ReorderEvent,
} from 'react-native-reorderable';
import { Action, formatReorderEvent, type PublicOutcome } from './components';
import {
  createExactRows,
  createSectionPreset,
  createVariableRows,
  type ScenarioId,
  type ScenarioRow,
  type ScenarioSection,
} from './scenario-catalog';
import { styles } from './theme';

type OutcomeWriter = (outcome: PublicOutcome) => void;

function flatOrder(
  event: ReorderEvent,
  current: readonly ScenarioRow[]
): ScenarioRow[] {
  const byId = new Map(current.map((row) => [row.id, row]));
  return (event.nextOrder[0]?.itemIds ?? []).flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

function sectionOrder(
  event: ReorderEvent,
  current: readonly ScenarioSection[]
): ScenarioSection[] {
  const rows = new Map(
    current.flatMap((section) =>
      section.data.map((row) => [row.id, row] as const)
    )
  );
  const next = new Map(
    event.nextOrder.map((collection) => [
      collection.sectionId,
      collection.itemIds,
    ])
  );
  return current.map((section) => ({
    ...section,
    data: (next.get(section.id) ?? []).flatMap((id) => {
      const row = rows.get(id);
      return row ? [row] : [];
    }),
  }));
}

function orderPreview(rows: readonly ScenarioRow[]): string {
  const head = rows
    .slice(0, 6)
    .map((row) => row.id)
    .join(', ');
  return `${head}${rows.length > 6 ? ` … (${rows.length})` : ''}`;
}

export function sectionOrderPreview(
  sections: readonly ScenarioSection[]
): string {
  return sections
    .map((section) => {
      const ids = section.data.map((row) => row.id);
      return `${section.id}[${ids.join(', ') || 'empty'}]`;
    })
    .join(' · ');
}

function Row({
  item,
  selected = false,
}: Readonly<{ item: ScenarioRow; selected?: boolean }>) {
  return (
    <View
      accessibilityLabel={`${item.label}${selected ? ', selected' : ''}`}
      style={[
        styles.row,
        { height: item.height },
        selected && styles.rowSelected,
      ]}
      testID={`row-${item.id}`}
    >
      <Text style={styles.rowText}>{item.label}</Text>
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.grip}
      >
        ⠿
      </Text>
    </View>
  );
}

export function FlatScenario({
  engine,
  onOutcome,
  onPresetChange,
  preset,
  resetToken,
  scenario,
}: Readonly<{
  engine: EnginePolicy;
  onOutcome: OutcomeWriter;
  onPresetChange?: (preset: string) => void;
  preset?: string;
  resetToken: number;
  scenario: ScenarioId;
}>) {
  const initial = useMemo(() => {
    if (scenario === 'exact-10000') return createExactRows(10_000);
    if (scenario === 'variable-1000') return createVariableRows(1_000);
    if (scenario === 'autoscroll-200')
      return createExactRows(200, 'autoscroll');
    return createExactRows(scenario === 'virtualized-list' ? 60 : 12, 'list');
  }, [scenario]);
  const [rows, setRows] = useState(initial);
  const [callbackCount, setCallbackCount] = useState(0);
  const [lastEvent, setLastEvent] = useState('None');
  const [controlMode, setControlMode] = useState<
    'accept' | 'delay' | 'restore'
  >(preset === 'delay' || preset === 'restore' ? preset : 'accept');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setRows(initial);
    setCallbackCount(0);
    setLastEvent('None');
    setControlMode(
      preset === 'delay' || preset === 'restore' ? preset : 'accept'
    );
    if (timer.current) clearTimeout(timer.current);
  }, [initial, preset, resetToken]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  useEffect(() => {
    onOutcome({
      order: orderPreview(rows),
      selection: 'none',
      event: lastEvent,
      callbackCount,
    });
  }, [callbackCount, lastEvent, onOutcome, rows]);
  const handleReorder = useCallback(
    (event: ReorderEvent) => {
      const proposed = flatOrder(event, rows);
      setCallbackCount((count) => count + 1);
      setLastEvent(formatReorderEvent(event));
      if (controlMode === 'accept') setRows(proposed);
      if (controlMode === 'delay') {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setRows(proposed), 800);
      }
    },
    [controlMode, rows]
  );
  const variable = scenario === 'variable-1000';
  return (
    <>
      {scenario === 'controlled-order' ? (
        <View style={styles.actions}>
          {(['accept', 'delay', 'restore'] as const).map((mode) => (
            <Action
              id={`controlled-${mode}`}
              key={mode}
              label={`${mode === controlMode ? '✓ ' : ''}${mode[0]!.toUpperCase()}${mode.slice(1)}`}
              onPress={() => {
                setControlMode(mode);
                onPresetChange?.(mode);
              }}
            />
          ))}
        </View>
      ) : null}
      {scenario === 'autoscroll-200' ? (
        <Text style={styles.instruction}>
          Long-press a row, then hold near an edge to traverse several
          viewports.
        </Text>
      ) : null}
      <ReorderableList
        accessibilityLabel={`${initial.length} reorderable rows`}
        data={rows}
        engine={engine}
        estimatedItemSize={variable ? 68 : undefined}
        getItemLayout={
          variable
            ? undefined
            : (_data, index) => ({ index, length: 52, offset: index * 52 })
        }
        initialNumToRender={10}
        keyExtractor={(item) => item.id}
        maxToRenderPerBatch={10}
        onReorder={handleReorder}
        removeClippedSubviews
        renderItem={({ item }) => <Row item={item} />}
        style={styles.list}
        testID={`${scenario}-list`}
        windowSize={5}
      />
    </>
  );
}

export function FreeFormScenario({
  engine,
  onOutcome,
  resetToken,
  selected = false,
}: Readonly<{
  engine: EnginePolicy;
  onOutcome: OutcomeWriter;
  resetToken: number;
  selected?: boolean;
}>) {
  const initial = useMemo(() => createExactRows(6, 'card'), []);
  const [rows, setRows] = useState(initial);
  const [count, setCount] = useState(0);
  const [lastEvent, setLastEvent] = useState('None');
  const selectedIds = useMemo(
    () => (selected ? ['card-1', 'card-2', 'card-4'] : []),
    [selected]
  );
  useEffect(() => {
    setRows(initial);
    setCount(0);
    setLastEvent('None');
  }, [initial, resetToken]);
  useEffect(
    () =>
      onOutcome({
        order: orderPreview(rows),
        selection: selectedIds.join(', ') || 'none',
        event: lastEvent,
        callbackCount: count,
      }),
    [count, lastEvent, onOutcome, rows, selectedIds]
  );
  return (
    <ReorderableContainer
      accessibilityLabel={
        selected
          ? 'Application-owned multi-selection cards'
          : 'Free-form reorderable cards'
      }
      engine={engine}
      onReorder={(event) => {
        setRows(flatOrder(event, rows));
        setCount((value) => value + 1);
        setLastEvent(formatReorderEvent(event));
      }}
      selectedIds={selectedIds}
      style={styles.cards}
      testID={selected ? 'multi-selection-container' : 'free-form-container'}
    >
      {rows.map((row) => (
        <ReorderableItem
          accessibilityLabel={row.label}
          id={row.id}
          key={row.id}
          style={[
            styles.card,
            selectedIds.includes(row.id) && styles.cardSelected,
          ]}
          testID={`card-${row.id}`}
        >
          <Text style={styles.cardText}>{row.label}</Text>
          <Text style={styles.grip}>⠿</Text>
        </ReorderableItem>
      ))}
    </ReorderableContainer>
  );
}

export function SectionScenario({
  engine,
  onOutcome,
  onPresetChange,
  preset: externalPreset,
  resetToken,
  selectionLab = false,
  teaching = false,
}: Readonly<{
  engine: EnginePolicy;
  onOutcome: OutcomeWriter;
  onPresetChange?: (preset: string) => void;
  preset?: string;
  resetToken: number;
  selectionLab?: boolean;
  teaching?: boolean;
}>) {
  const initial = useMemo(
    () =>
      teaching ? createSectionPreset().slice(0, 4) : createSectionPreset(),
    [teaching]
  );
  const [sections, setSections] = useState(initial);
  const [count, setCount] = useState(0);
  const [lastEvent, setLastEvent] = useState('None');
  const [preset, setPreset] = useState<
    'contiguous' | 'noncontiguous' | 'cross-section'
  >(
    externalPreset === 'noncontiguous' || externalPreset === 'cross-section'
      ? externalPreset
      : 'contiguous'
  );
  const selectedIds = useMemo(
    () =>
      selectionLab
        ? preset === 'contiguous'
          ? ['section-1-row-2', 'section-1-row-3', 'section-1-row-4']
          : preset === 'noncontiguous'
            ? ['section-1-row-2', 'section-1-row-7', 'section-1-row-11']
            : ['section-1-row-2', 'section-13-row-3', 'section-24-row-4']
        : [],
    [preset, selectionLab]
  );
  useEffect(() => {
    setSections(initial);
    setCount(0);
    setLastEvent('None');
    setPreset(
      externalPreset === 'noncontiguous' || externalPreset === 'cross-section'
        ? externalPreset
        : 'contiguous'
    );
  }, [externalPreset, initial, resetToken]);
  useEffect(
    () =>
      onOutcome({
        order: sectionOrderPreview(sections),
        selection: selectedIds.join(', ') || 'none',
        event: lastEvent,
        callbackCount: count,
      }),
    [count, lastEvent, onOutcome, sections, selectedIds]
  );
  const selectedSet = new Set(selectedIds);
  return (
    <>
      {selectionLab ? (
        <View style={styles.actions}>
          {(['contiguous', 'noncontiguous', 'cross-section'] as const).map(
            (value) => (
              <Action
                id={`selection-${value}`}
                key={value}
                label={`${value === preset ? '✓ ' : ''}${value}`}
                onPress={() => {
                  setPreset(value);
                  onPresetChange?.(value);
                }}
              />
            )
          )}
        </View>
      ) : null}
      <ReorderableSectionList<ScenarioRow, ScenarioSection>
        accessibilityLabel={
          selectionLab
            ? 'Selection preset section list'
            : teaching
              ? 'Three sections of twenty five rows with one empty beginning section'
              : 'Twenty four sections of twenty five rows with empty sections at the beginning, middle, and end'
        }
        engine={engine}
        estimatedItemSize={52}
        initialNumToRender={8}
        keyExtractor={(item) => item.id}
        maxToRenderPerBatch={8}
        onReorder={(event) => {
          setSections(sectionOrder(event, sections));
          setCount((value) => value + 1);
          setLastEvent(formatReorderEvent(event));
        }}
        removeClippedSubviews
        renderItem={({ item }) => (
          <Row item={item} selected={selectedSet.has(item.id)} />
        )}
        renderSectionFooter={({ section }) => (
          <View style={styles.sectionFooter}>
            <Text style={styles.sectionFooterText}>
              {section.data.length === 0
                ? 'Empty destination'
                : `${section.data.length} rows`}{' '}
              · footer
            </Text>
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{section.title}</Text>
          </View>
        )}
        sections={sections}
        selectedIds={selectedIds}
        style={styles.list}
        testID={selectionLab ? 'selection-section-list' : 'sections-24x25-list'}
        windowSize={5}
      />
    </>
  );
}
