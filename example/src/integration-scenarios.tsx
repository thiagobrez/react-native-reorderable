import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { ReorderEvent } from 'react-native-reorderable';
import {
  ReorderableFlashList,
  ReorderableFlashSectionList,
} from 'react-native-reorderable/flash-list';
import {
  ReorderableLegendList,
  ReorderableLegendSectionList,
} from 'react-native-reorderable/legend-list';
import { formatReorderEvent, type PublicOutcome } from './components';
import {
  createVariableRows,
  type ScenarioId,
  type ScenarioRow,
  type ScenarioSection,
} from './scenario-catalog';
import { styles } from './theme';

type Props = Readonly<{
  scenario: ScenarioId;
  resetToken: number;
  onOutcome: (outcome: PublicOutcome) => void;
}>;

function Row({ item }: { item: ScenarioRow }) {
  return (
    <View
      accessibilityLabel={item.label}
      style={[styles.row, { height: item.height }]}
      testID={`integration-row-${item.id}`}
    >
      <Text style={styles.rowText}>{item.label}</Text>
      <Text style={styles.grip}>⠿</Text>
    </View>
  );
}

function preview(rows: readonly ScenarioRow[]) {
  return `${rows
    .slice(0, 5)
    .map((row) => row.id)
    .join(', ')} … (${rows.length})`;
}

export function IntegrationScenario({
  onOutcome,
  resetToken,
  scenario,
}: Props) {
  const provider = scenario.startsWith('flash') ? 'flash' : 'legend';
  const sectioned = scenario.endsWith('section-list');
  const initialRows = useMemo(
    () => createVariableRows(80, provider),
    [provider]
  );
  const initialSections = useMemo<readonly ScenarioSection[]>(
    () => [
      {
        id: `${provider}-first`,
        title: 'First group',
        data: initialRows.slice(0, 40),
      },
      {
        id: `${provider}-second`,
        title: 'Second group',
        data: initialRows.slice(40),
      },
    ],
    [initialRows, provider]
  );
  const [rows, setRows] = useState(initialRows);
  const [sections, setSections] = useState(initialSections);
  const [count, setCount] = useState(0);
  const [event, setEvent] = useState('None');
  useEffect(() => {
    setRows(initialRows);
    setSections(initialSections);
    setCount(0);
    setEvent('None');
  }, [initialRows, initialSections, resetToken]);
  useEffect(
    () =>
      onOutcome({
        order: preview(
          sectioned ? sections.flatMap((section) => section.data) : rows
        ),
        selection: 'none',
        event,
        callbackCount: count,
      }),
    [count, event, onOutcome, rows, sectioned, sections]
  );
  const commit = (result: ReorderEvent) => {
    const byId = new Map(
      [...rows, ...sections.flatMap((section) => section.data)].map((row) => [
        row.id,
        row,
      ])
    );
    if (sectioned) {
      const order = new Map(
        result.nextOrder.map((collection) => [
          collection.sectionId,
          collection.itemIds,
        ])
      );
      setSections((current) =>
        current.map((section) => ({
          ...section,
          data: (order.get(section.id) ?? []).flatMap((id) => {
            const row = byId.get(id);
            return row ? [row] : [];
          }),
        }))
      );
    } else
      setRows(
        (result.nextOrder[0]?.itemIds ?? []).flatMap((id) => {
          const row = byId.get(id);
          return row ? [row] : [];
        })
      );
    setCount((value) => value + 1);
    setEvent(formatReorderEvent(result));
  };
  const common = {
    engine: 'auto' as const,
    estimatedItemSize: 68,
    keyExtractor: (item: ScenarioRow) => item.id,
    onReorder: commit,
    renderItem: ({ item }: { item: ScenarioRow }) => <Row item={item} />,
    style: styles.list,
  };
  if (provider === 'flash' && !sectioned)
    return (
      <ReorderableFlashList
        {...common}
        data={rows}
        testID="flash-list-integration"
      />
    );
  if (provider === 'flash')
    return (
      <ReorderableFlashSectionList
        {...common}
        renderSectionFooter={({ section }) => (
          <Text style={styles.sectionFooterText}>{section.title} footer</Text>
        )}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeaderText}>{section.title}</Text>
        )}
        sections={sections}
        testID="flash-section-list-integration"
      />
    );
  if (!sectioned)
    return (
      <ReorderableLegendList
        {...common}
        data={rows}
        recycleItems
        testID="legend-list-integration"
      />
    );
  return (
    <ReorderableLegendSectionList
      {...common}
      recycleItems
      renderSectionFooter={({ section }) => (
        <Text style={styles.sectionFooterText}>{section.title} footer</Text>
      )}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionHeaderText}>{section.title}</Text>
      )}
      sections={sections}
      testID="legend-section-list-integration"
    />
  );
}
