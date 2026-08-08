import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  DragDropContainer,
  DraggableItem,
  DropZone,
  ReorderableContainer,
  ReorderableItem,
  ReorderableList,
  ReorderableSectionList,
  type ReorderEvent,
  type EnginePolicy,
} from 'react-native-reorderable';
import {
  ReorderableFlashList,
  ReorderableFlashSectionList,
} from 'react-native-reorderable/flash-list';
import { NativeCommitAcceptanceContainer } from '../../src/issue25-acceptance';
import { FallbackCommitAcceptanceContainer } from '../../src/issue26-acceptance';
import type { SemanticActionRequest } from '../../src/issue31-acceptance';
import {
  FallbackDropAcceptanceContainer,
  NativeDropAcceptanceContainer,
} from '../../src/issue29-acceptance';

type Card = Readonly<{
  color: string;
  id: string;
  label: string;
}>;

type Demo = 'single' | 'sections' | 'drop' | 'scale' | 'variable' | 'flash';

const initialCards: readonly Card[] = [
  { id: 'blue', label: 'Blue', color: '#0A84FF' },
  { id: 'green', label: 'Green', color: '#30D158' },
  { id: 'yellow', label: 'Yellow', color: '#FFD60A' },
  { id: 'orange', label: 'Orange', color: '#FF9F0A' },
  { id: 'pink', label: 'Pink', color: '#FF375F' },
];

function itemsInOrder<T extends { id: string }>(
  items: readonly T[],
  itemIds: readonly string[]
): T[] {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return itemIds.flatMap((id) => {
    const item = itemsById.get(id);
    return item ? [item] : [];
  });
}

function DemoSelector({
  demo,
  onChange,
}: {
  demo: Demo;
  onChange: (demo: Demo) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.demoSelector}>
      {(
        [
          ['single', 'Single'],
          ['sections', 'Sections'],
          ['drop', 'Drop'],
          ['scale', '10k list'],
          ['variable', 'Variable'],
          ['flash', 'Flash'],
        ] as const
      ).map(([value, label]) => {
        const selected = value === demo;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={value}
            onPress={() => onChange(value)}
            style={[styles.demoTab, selected && styles.demoTabSelected]}
            testID={`demo-${value}`}
          >
            <Text
              style={[
                styles.demoTabText,
                selected && styles.demoTabTextSelected,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type ScaleItem = Readonly<{ id: string; label: string }>;
const initialScaleItems: readonly ScaleItem[] = Array.from(
  { length: 10_000 },
  (_, index) => ({ id: `row-${index}`, label: `Row ${index}` })
);
const SCALE_ITEM_HEIGHT = 50;

function ScaleRow({
  item,
  onMountChange,
}: Readonly<{
  item: ScaleItem;
  onMountChange: (change: number) => void;
}>) {
  useEffect(() => {
    onMountChange(1);
    return () => onMountChange(-1);
  }, [onMountChange]);
  return (
    <View
      accessibilityLabel={item.label}
      style={styles.scaleRow}
      testID={`scale-${item.id}`}
    >
      <Text style={styles.scaleRowLabel}>{item.label}</Text>
    </View>
  );
}

function ScaleListExample({ engine }: { engine: EnginePolicy }) {
  const [items, setItems] = useState(initialScaleItems);
  const [callbackCount, setCallbackCount] = useState(0);
  const [mountedRows, setMountedRows] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const handleMountChange = useCallback((change: number) => {
    setMountedRows((current) => current + change);
  }, []);
  const handleReorder = (event: ReorderEvent) => {
    const nextIds = event.nextOrder[0]?.itemIds;
    if (nextIds == null) return;
    setItems((current) => itemsInOrder(current, nextIds));
    setCallbackCount((current) => current + 1);
  };
  return (
    <View style={styles.scaleScenario}>
      <Text style={styles.outcome} testID="scale-mounted-count">
        Mounted rows: {mountedRows} / 10000
      </Text>
      <Text style={styles.outcome} testID="scale-callback-count">
        Reorder callbacks: {callbackCount}
      </Text>
      <Text style={styles.outcome} testID="scale-order">
        First rows:{' '}
        {items
          .slice(0, 5)
          .map((item) => item.label)
          .join(', ')}
      </Text>
      <Pressable
        accessibilityLabel={
          enabled ? 'Disable list reorder' : 'Enable list reorder'
        }
        accessibilityRole="button"
        onPress={() => setEnabled((current) => !current)}
        style={styles.scenarioAction}
      >
        <Text style={styles.scenarioActionText}>
          {enabled ? 'Disable list reorder' : 'Enable list reorder'}
        </Text>
      </Pressable>
      <ReorderableList
        accessibilityLabel="Ten thousand reorderable rows"
        data={items}
        enabled={enabled}
        engine={engine}
        getItemLayout={(_data, index) => ({
          index,
          length: SCALE_ITEM_HEIGHT,
          offset: index * SCALE_ITEM_HEIGHT,
        })}
        initialNumToRender={8}
        keyExtractor={(item) => item.id}
        maxToRenderPerBatch={8}
        onReorder={handleReorder}
        removeClippedSubviews
        renderItem={({ item }) => (
          <ScaleRow item={item} onMountChange={handleMountChange} />
        )}
        style={styles.scaleList}
        testID="scale-list"
        windowSize={5}
      />
    </View>
  );
}

type VariableItem = Readonly<{ id: string; label: string; height: number }>;
const initialVariableItems: readonly VariableItem[] = Array.from(
  { length: 1_000 },
  (_, index) => ({
    id: `variable-${index}`,
    label: `Variable row ${index}`,
    height: 40 + ((index * 37) % 5) * 14,
  })
);

function VariableRow({
  item,
  onMountChange,
}: Readonly<{
  item: VariableItem;
  onMountChange: (change: number) => void;
}>) {
  useEffect(() => {
    onMountChange(1);
    return () => onMountChange(-1);
  }, [onMountChange]);
  return (
    <View
      accessibilityLabel={`${item.label}, ${item.height} points tall`}
      style={[styles.variableRow, { height: item.height }]}
      testID={`variable-${item.id}`}
    >
      <Text style={styles.scaleRowLabel}>{item.label}</Text>
      <Text style={styles.variableHeight}>{item.height} pt</Text>
    </View>
  );
}

function VariableListExample({ engine }: { engine: EnginePolicy }) {
  const [items, setItems] = useState(initialVariableItems);
  const [callbackCount, setCallbackCount] = useState(0);
  const [mountedRows, setMountedRows] = useState(0);
  const handleMountChange = useCallback((change: number) => {
    setMountedRows((current) => current + change);
  }, []);
  const reset = useCallback(() => {
    setItems(initialVariableItems);
    setCallbackCount(0);
  }, []);
  const handleReorder = useCallback((event: ReorderEvent) => {
    const nextIds = event.nextOrder[0]?.itemIds;
    if (nextIds == null) return;
    setItems((current) => itemsInOrder(current, nextIds));
    setCallbackCount((current) => current + 1);
  }, []);
  return (
    <View style={styles.scaleScenario} testID="variable-scenario">
      <Text style={styles.outcome} testID="variable-mounted-count">
        Mounted/rendered rows: {mountedRows} / 1000
      </Text>
      <Text style={styles.outcome} testID="variable-callback-count">
        Reorder callbacks: {callbackCount}
      </Text>
      <Text style={styles.outcome} testID="variable-order">
        First rows:{' '}
        {items
          .slice(0, 5)
          .map((item) => item.label)
          .join(', ')}
      </Text>
      <Pressable
        accessibilityLabel="Reset variable-height scenario"
        accessibilityRole="button"
        onPress={reset}
        style={styles.scenarioAction}
        testID="variable-reset"
      >
        <Text style={styles.scenarioActionText}>Reset</Text>
      </Pressable>
      <ReorderableList
        accessibilityLabel="One thousand variable-height reorderable rows"
        data={items}
        engine={engine}
        estimatedItemSize={68}
        initialNumToRender={8}
        keyExtractor={(item) => item.id}
        maxToRenderPerBatch={8}
        onReorder={handleReorder}
        removeClippedSubviews
        renderItem={({ item }) => (
          <VariableRow item={item} onMountChange={handleMountChange} />
        )}
        style={styles.scaleList}
        testID="variable-list"
        windowSize={5}
      />
    </View>
  );
}

const initialFlashItems: readonly VariableItem[] = Array.from(
  { length: 120 },
  (_, index) => ({
    id: `flash-${index}`,
    label: `Flash row ${index}`,
    height: 42 + ((index * 29) % 4) * 12,
  })
);
type FlashSectionId =
  'empty-start' | 'first' | 'empty-middle' | 'second' | 'third' | 'empty-end';
const initialFlashSectionItemIds: Readonly<
  Record<FlashSectionId, readonly string[]>
> = {
  'empty-start': [],
  'first': initialFlashItems.slice(0, 40).map((item) => item.id),
  'empty-middle': [],
  'second': initialFlashItems.slice(40, 80).map((item) => item.id),
  'third': initialFlashItems.slice(80).map((item) => item.id),
  'empty-end': [],
};

function FlashListIntegrations({ engine }: { engine: EnginePolicy }) {
  const [mode, setMode] = useState<'list' | 'sections'>('list');
  const [items, setItems] = useState(initialFlashItems);
  const [sectionItemIds, setSectionItemIds] = useState(
    initialFlashSectionItemIds
  );
  const [reorderCallbackCount, setReorderCallbackCount] = useState(0);
  const [lastReorderEvent, setLastReorderEvent] = useState('none');
  const [enabled, setEnabled] = useState(true);
  const [selected, setSelected] = useState(false);
  const [cancellationArmed, setCancellationArmed] = useState(false);
  const [mountedRows, setMountedRows] = useState(0);
  const cancellationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (cancellationTimer.current != null)
        clearTimeout(cancellationTimer.current);
    },
    []
  );
  const handleMountChange = useCallback((change: number) => {
    setMountedRows((current) => current + change);
  }, []);
  const reset = useCallback(() => {
    setItems(initialFlashItems);
    setSectionItemIds(initialFlashSectionItemIds);
    setReorderCallbackCount(0);
    setLastReorderEvent('none');
    setEnabled(true);
    setSelected(false);
    setCancellationArmed(false);
    if (cancellationTimer.current != null)
      clearTimeout(cancellationTimer.current);
  }, []);
  const handleReorder = useCallback(
    (event: ReorderEvent) => {
      const nextIds = event.nextOrder.flatMap(
        (collection) => collection.itemIds
      );
      setItems((current) => itemsInOrder(current, nextIds));
      if (mode === 'sections') {
        const proposed = new Map(
          event.nextOrder.flatMap((collection) =>
            collection.sectionId == null
              ? []
              : [[collection.sectionId, collection.itemIds] as const]
          )
        );
        setSectionItemIds({
          'empty-start': proposed.get('empty-start') ?? [],
          'first': proposed.get('first') ?? [],
          'empty-middle': proposed.get('empty-middle') ?? [],
          'second': proposed.get('second') ?? [],
          'third': proposed.get('third') ?? [],
          'empty-end': proposed.get('empty-end') ?? [],
        });
      }
      setReorderCallbackCount((current) => current + 1);
      setLastReorderEvent(JSON.stringify(event));
    },
    [mode]
  );
  const cancelNextHold = useCallback(() => {
    if (cancellationTimer.current != null)
      clearTimeout(cancellationTimer.current);
    setEnabled(true);
    setCancellationArmed(true);
    cancellationTimer.current = setTimeout(() => {
      setEnabled(false);
      setCancellationArmed(false);
      cancellationTimer.current = null;
    }, 3000);
  }, []);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const sectionItems = (sectionId: FlashSectionId) =>
    sectionItemIds[sectionId].flatMap((id) => {
      const item = itemById.get(id);
      return item == null ? [] : [item];
    });
  const sections = [
    {
      id: 'empty-start',
      title: 'Empty start',
      data: sectionItems('empty-start'),
    },
    { id: 'first', title: 'First', data: sectionItems('first') },
    {
      id: 'empty-middle',
      title: 'Empty middle',
      data: sectionItems('empty-middle'),
    },
    { id: 'second', title: 'Second', data: sectionItems('second') },
    { id: 'third', title: 'Third', data: sectionItems('third') },
    { id: 'empty-end', title: 'Empty end', data: sectionItems('empty-end') },
  ] as const;
  const controls = (
    <View style={[styles.engineSelector, styles.flashControls]}>
      {(['list', 'sections'] as const).map((value) => (
        <Pressable
          accessibilityRole="button"
          key={value}
          onPress={() => setMode(value)}
          style={[styles.scenarioAction, styles.flashScenarioAction]}
          testID={`flash-mode-${value}`}
        >
          <Text
            style={[styles.scenarioActionText, styles.flashScenarioActionText]}
          >
            {value === 'list' ? 'List' : 'Sections'}
          </Text>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => setEnabled((value) => !value)}
        style={[styles.scenarioAction, styles.flashScenarioAction]}
        testID="flash-cancel-toggle"
      >
        <Text
          style={[styles.scenarioActionText, styles.flashScenarioActionText]}
        >
          {enabled ? 'Disable' : 'Enable'}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={cancelNextHold}
        style={[styles.scenarioAction, styles.flashScenarioAction]}
        testID="flash-cancel-next-hold"
      >
        <Text
          style={[styles.scenarioActionText, styles.flashScenarioActionText]}
        >
          {cancellationArmed ? 'Armed' : 'Cancel hold'}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => setSelected((value) => !value)}
        style={[styles.scenarioAction, styles.flashScenarioAction]}
        testID="flash-selection-toggle"
      >
        <Text
          style={[styles.scenarioActionText, styles.flashScenarioActionText]}
        >
          Select
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={reset}
        style={[styles.scenarioAction, styles.flashScenarioAction]}
        testID="flash-reset"
      >
        <Text
          style={[styles.scenarioActionText, styles.flashScenarioActionText]}
        >
          Reset
        </Text>
      </Pressable>
    </View>
  );
  const status = (
    <View>
      <Text style={styles.outcome} testID="flash-mounted-count">
        Mounted rows: {mountedRows} / 120
      </Text>
      <Text style={styles.outcome} testID="flash-order">
        Order:{' '}
        {items
          .slice(0, 5)
          .map((item) => item.id)
          .join(', ')}
      </Text>
      <Text style={styles.outcome} testID="flash-reorder-callback-count">
        Reorder callbacks: {reorderCallbackCount}
      </Text>
      <Text style={styles.outcome} testID="flash-last-reorder-event">
        Last reorder event: {lastReorderEvent}
      </Text>
      <Text style={styles.outcome} testID="flash-selection">
        Selection:{' '}
        {selected
          ? mode === 'list'
            ? 'flash-7, flash-9'
            : 'flash-1, flash-41'
          : 'none'}
      </Text>
    </View>
  );
  const renderFlashRow = ({ item }: { item: VariableItem }) => (
    <VariableRow item={item} onMountChange={handleMountChange} />
  );
  return (
    <View style={styles.scaleScenario} testID="flash-integrations">
      {controls}
      {status}
      {mode === 'list' ? (
        <ReorderableFlashList
          data={items}
          drawDistance={240}
          enabled={enabled}
          engine={engine}
          estimatedItemSize={60}
          keyExtractor={(item) => item.id}
          onReorder={handleReorder}
          renderItem={renderFlashRow}
          selectedIds={selected ? ['flash-7', 'flash-9'] : []}
          style={styles.scaleList}
          testID="flash-list-integration"
        />
      ) : (
        <ReorderableFlashSectionList
          drawDistance={240}
          enabled={enabled}
          engine={engine}
          estimatedItemSize={60}
          keyExtractor={(item) => item.id}
          onReorder={handleReorder}
          renderItem={renderFlashRow}
          renderSectionFooter={({ section }) => (
            <Text style={styles.sectionFooter}>{section.title} footer</Text>
          )}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          sections={sections}
          selectedIds={selected ? ['flash-1', 'flash-41'] : []}
          style={styles.scaleList}
          testID="flash-section-list-integration"
        />
      )}
    </View>
  );
}

function SingleCollectionExample({ engine }: { engine: EnginePolicy }) {
  const [cards, setCards] = useState(initialCards);
  const [callbackCount, setCallbackCount] = useState(0);
  const [nestedPressCount, setNestedPressCount] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [mounted, setMounted] = useState(true);
  const [interactionActive, setInteractionActive] = useState(false);

  const handleReorder = (event: ReorderEvent) => {
    const itemIds = event.nextOrder[0]?.itemIds;
    if (itemIds) {
      setCards((current) => itemsInOrder(current, itemIds));
      setCallbackCount((current) => current + 1);
    }
  };

  const renderedCards = cards.map((card) => (
    <ReorderableItem
      accessibilityLabel={`${card.label} card`}
      id={card.id}
      key={card.id}
      style={[styles.card, { backgroundColor: card.color }]}
      testID={`single-card-${card.id}`}
    >
      <Pressable
        accessibilityLabel={`${card.label} nested action`}
        onPress={() => setNestedPressCount((current) => current + 1)}
        style={styles.nestedAction}
      >
        <Text style={styles.cardLabel}>{card.label}</Text>
      </Pressable>
    </ReorderableItem>
  ));

  return (
    <>
      <Text style={styles.outcome} testID="single-order">
        Order: {cards.map((card) => card.label).join(', ')}
      </Text>
      <Text style={styles.outcome} testID="single-callback-count">
        Reorder callbacks: {callbackCount}
      </Text>
      <Text style={styles.outcome} testID="single-nested-press-count">
        Nested short presses: {nestedPressCount}
      </Text>
      <Text style={styles.outcome} testID="single-interaction-state">
        Interaction: {interactionActive ? 'active' : 'inactive'}
      </Text>
      <View style={styles.scenarioActions}>
        <Pressable
          accessibilityLabel={enabled ? 'Disable reorder' : 'Enable reorder'}
          accessibilityRole="button"
          onPress={() => setEnabled((current) => !current)}
          style={styles.scenarioAction}
        >
          <Text style={styles.scenarioActionText}>
            {enabled ? 'Disable' : 'Enable'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={mounted ? 'Unmount reorder' : 'Mount reorder'}
          accessibilityRole="button"
          onPress={() => setMounted((current) => !current)}
          style={styles.scenarioAction}
        >
          <Text style={styles.scenarioActionText}>
            {mounted ? 'Unmount' : 'Mount'}
          </Text>
        </Pressable>
      </View>
      {!mounted ? null : __DEV__ && engine === 'auto' ? (
        <NativeCommitAcceptanceContainer
          acceptanceMove={{
            sourceIds: ['yellow'],
            destination: { sectionId: null, beforeId: 'green' },
          }}
          accessibilityLabel="Single collection cards"
          enabled={enabled}
          onInteractionStateChange={setInteractionActive}
          onReorder={handleReorder}
          style={styles.verticalCards}
          testID="single-container"
        >
          {renderedCards}
        </NativeCommitAcceptanceContainer>
      ) : __DEV__ ? (
        <FallbackCommitAcceptanceContainer
          acceptanceMove={{
            sourceIds: ['yellow'],
            destination: { sectionId: null, beforeId: 'green' },
          }}
          accessibilityLabel="Single collection cards"
          enabled={enabled}
          onInteractionStateChange={setInteractionActive}
          onReorder={handleReorder}
          style={styles.verticalCards}
          testID="single-container"
        >
          {renderedCards}
        </FallbackCommitAcceptanceContainer>
      ) : (
        <ReorderableContainer
          accessibilityLabel="Single collection cards"
          engine={engine}
          enabled={enabled}
          onReorder={handleReorder}
          style={styles.verticalCards}
          testID="single-container"
        >
          {renderedCards}
        </ReorderableContainer>
      )}
    </>
  );
}

type SectionRow = Readonly<{ id: string; label: string; height: number }>;
type ScaleSection = Readonly<{
  id: string;
  title: string;
  data: readonly SectionRow[];
}>;

const EMPTY_SECTION_INDEXES = new Set([0, 12, 23]);
const initialScaleSections: readonly ScaleSection[] = Array.from(
  { length: 24 },
  (_, sectionIndex) => ({
    id: `section-${sectionIndex}`,
    title: `Section ${sectionIndex}`,
    data: EMPTY_SECTION_INDEXES.has(sectionIndex)
      ? []
      : Array.from({ length: 25 }, (_unused, itemIndex) => ({
          id: `section-${sectionIndex}-row-${itemIndex}`,
          label: `Section ${sectionIndex} row ${itemIndex}`,
          height: 44 + ((sectionIndex * 13 + itemIndex * 17) % 4) * 12,
        })),
  })
);
const sectionSelection = [
  'section-1-row-1',
  'section-6-row-12',
  'section-18-row-20',
] as const;
const noSectionSelection: readonly string[] = [];

function SectionScaleRow({
  item,
  onMountChange,
  selected,
}: {
  item: SectionRow;
  onMountChange: (change: number) => void;
  selected: boolean;
}) {
  useEffect(() => {
    onMountChange(1);
    return () => onMountChange(-1);
  }, [onMountChange]);
  return (
    <View
      accessibilityLabel={item.label}
      accessibilityState={{ selected }}
      style={[
        styles.sectionScaleRow,
        { height: item.height },
        selected && styles.reorderSelected,
      ]}
      testID={`sections-row-${item.id}`}
    >
      <Text style={styles.scaleRowLabel}>{item.label}</Text>
      <Text style={styles.variableHeight}>{item.height} pt</Text>
    </View>
  );
}

function SectionedCollectionExample({ engine }: { engine: EnginePolicy }) {
  const [sections, setSections] = useState(initialScaleSections);
  const [callbackCount, setCallbackCount] = useState(0);
  const [lastEvent, setLastEvent] = useState('None');
  const [mountedRows, setMountedRows] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [multiSelection, setMultiSelection] = useState(true);
  const [styledGeometry, setStyledGeometry] = useState(false);
  const selectedIds = multiSelection ? sectionSelection : noSectionSelection;
  const selectedSet = new Set<string>(selectedIds);
  const handleMountChange = useCallback((change: number) => {
    setMountedRows((current) => current + change);
  }, []);
  const getSectionItemLayout = useCallback(
    (
      currentSections: readonly ScaleSection[],
      sectionIndex: number,
      itemIndex: number
    ) => {
      let offset = 0;
      for (let index = 0; index < sectionIndex; index += 1) {
        offset += 32 + 24;
        currentSections[index]!.data.forEach((item) => {
          offset += item.height;
        });
      }
      offset += 32;
      for (let index = 0; index < itemIndex; index += 1)
        offset += currentSections[sectionIndex]!.data[index]!.height;
      const item = currentSections[sectionIndex]!.data[itemIndex]!;
      return { length: item.height, offset };
    },
    []
  );
  const reset = useCallback(() => {
    setSections(initialScaleSections);
    setCallbackCount(0);
    setLastEvent('None');
    setEnabled(true);
    setMultiSelection(true);
    setStyledGeometry(false);
  }, []);
  const handleReorder = useCallback((event: ReorderEvent) => {
    setCallbackCount((current) => current + 1);
    setLastEvent(
      `${event.sourceIds.join('+')} -> ${event.destination.sectionId}:${event.destination.beforeId ?? 'end'}`
    );
    setSections((current) => {
      const items = new Map(
        current
          .flatMap((section) => section.data)
          .map((item) => [item.id, item])
      );
      const currentSections = new Map(
        current.map((section) => [section.id, section])
      );
      return event.nextOrder.flatMap((order) => {
        if (order.sectionId == null) return [];
        const section = currentSections.get(order.sectionId);
        if (section == null) return [];
        return [
          {
            ...section,
            data: order.itemIds.flatMap((id) => {
              const item = items.get(id);
              return item == null ? [] : [item];
            }),
          },
        ];
      });
    });
  }, []);

  return (
    <View style={styles.scaleScenario} testID="sections-scenario">
      <Text style={styles.outcome} testID="sections-visible">
        Visible model: 24 sections, 525 rows, empty 0/12/23
      </Text>
      <Text style={styles.outcome} testID="sections-mounted-count">
        Mounted/rendered rows: {mountedRows} / 525
      </Text>
      <Text style={styles.outcome} testID="sections-selection">
        Selected: {selectedIds.length === 0 ? 'none' : selectedIds.join(', ')}
      </Text>
      <Text style={styles.outcome} numberOfLines={2} testID="sections-order">
        Order:{' '}
        {sections
          .map(
            (section) =>
              `${section.id}=[${section.data
                .slice(0, 2)
                .map((item) => item.id)
                .join(',')}${section.data.length > 2 ? ',…' : ''}]`
          )
          .join(' | ')}
      </Text>
      <Text style={styles.outcome} testID="sections-callback-count">
        Reorder callbacks: {callbackCount}
      </Text>
      <Text style={styles.outcome} testID="sections-last-event">
        Last event: {lastEvent}
      </Text>
      <Text style={styles.outcome} testID="sections-geometry-preset">
        Geometry preset:{' '}
        {styledGeometry ? '10% top / 18 bottom / 7 row gap' : 'exact anchors'}
      </Text>
      <View style={styles.scenarioActions}>
        <Pressable
          accessibilityLabel="Toggle percentage padding and row gap"
          accessibilityRole="button"
          onPress={() => setStyledGeometry((current) => !current)}
          style={styles.scenarioAction}
          testID="sections-style-toggle"
        >
          <Text style={styles.scenarioActionText}>Toggle styled geometry</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={
            enabled
              ? 'Cancel active section reorder and disable'
              : 'Enable section reorder'
          }
          accessibilityRole="button"
          onPress={() => setEnabled((current) => !current)}
          style={styles.scenarioAction}
          testID="sections-enable"
        >
          <Text style={styles.scenarioActionText}>
            {enabled ? 'Cancel / disable' : 'Enable'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Toggle cross-section selection"
          accessibilityRole="button"
          onPress={() => setMultiSelection((current) => !current)}
          style={styles.scenarioAction}
          testID="sections-selection-toggle"
        >
          <Text style={styles.scenarioActionText}>
            {multiSelection ? 'Clear selection' : 'Select across sections'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Reset section scenario"
          accessibilityRole="button"
          onPress={reset}
          style={styles.scenarioAction}
          testID="sections-reset"
        >
          <Text style={styles.scenarioActionText}>Reset</Text>
        </Pressable>
      </View>
      <ReorderableSectionList<SectionRow, ScaleSection>
        accessibilityLabel="Twenty four virtualized reorderable sections"
        enabled={enabled}
        engine={engine}
        estimatedItemSize={62}
        contentContainerStyle={
          styledGeometry ? styles.styledSectionContent : undefined
        }
        getItemLayout={styledGeometry ? undefined : getSectionItemLayout}
        initialNumToRender={8}
        keyExtractor={(item) => item.id}
        maxToRenderPerBatch={8}
        onReorder={handleReorder}
        removeClippedSubviews
        renderItem={({ item }) => (
          <SectionScaleRow
            item={item}
            onMountChange={handleMountChange}
            selected={selectedSet.has(item.id)}
          />
        )}
        renderSectionFooter={({ section }) => (
          <View
            style={styles.sectionScaleFooter}
            testID={`sections-footer-${section.id}`}
          >
            <Text style={styles.sectionFooter}>
              {section.data.length === 0
                ? 'Empty destination'
                : `${section.data.length} rows`}
            </Text>
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <View
            style={styles.sectionScaleHeader}
            testID={`sections-header-${section.id}`}
          >
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        sections={sections}
        selectedIds={selectedIds}
        style={styles.scaleList}
        testID="sections-container"
        windowSize={5}
      />
    </View>
  );
}

function DragDropExample({
  actionRequest,
  engine,
}: {
  actionRequest: SemanticActionRequest | null;
  engine: EnginePolicy;
}) {
  const [callbackCount, setCallbackCount] = useState(0);
  const [lastEvent, setLastEvent] = useState('None');
  const [appActionCount, setAppActionCount] = useState(0);
  const [acceptingEnabled, setAcceptingEnabled] = useState(true);
  const [destinationId, setDestinationId] = useState('accepting');
  const [sourceId, setSourceId] = useState('pink');
  const [showAccepting, setShowAccepting] = useState(true);
  const [predicateError, setPredicateError] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'multi' | 'single'>(
    'multi'
  );
  const predicateCount = useRef(0);
  const lastPredicateIds = useRef('None');
  const [nativeInteraction, setNativeInteraction] = useState('inactive (0)');
  const nativeInteractionCount = useRef(0);
  const selectedIds =
    selectionMode === 'multi'
      ? (['pink', 'missing', 'blue', 'pink', 'yellow'] as const)
      : (['green'] as const);
  const selectedSet = new Set<string>(selectedIds);
  const recordPredicate = (ids: readonly string[]) => {
    predicateCount.current += 1;
    lastPredicateIds.current = ids.join(',');
  };
  const containerProps = {
    acceptanceMove: { sourceId, destinationId },
    onDrop: (event: { itemIds: readonly string[]; destinationId: string }) => {
      setCallbackCount((current) => current + 1);
      setLastEvent(`${event.itemIds.join(',')} -> ${event.destinationId}`);
    },
    selectedIds,
    style: styles.dragLayout,
    testID: 'drag-drop-container',
  } as const;
  const content = (
    <>
      <View style={styles.dragSourcePanel}>
        <Text style={styles.sectionTitle}>Source</Text>
        <View style={styles.dragItems}>
          {initialCards
            .filter((card) => card.id !== 'orange')
            .map((card) => {
              const selected = selectedSet.has(card.id);
              return (
                <DraggableItem
                  accessibilityLabel={`${card.label} draggable card${selected ? ', selected' : ''}`}
                  id={card.id}
                  key={card.id}
                  style={styles.draggableItem}
                >
                  <View
                    style={[
                      styles.gridCard,
                      { backgroundColor: card.color },
                      selected && styles.gridCardSelected,
                    ]}
                  >
                    <Text style={styles.cardLabel}>{card.label}</Text>
                  </View>
                </DraggableItem>
              );
            })}
        </View>
      </View>
      <View style={styles.dropPanels}>
        {showAccepting ? (
          <DropZone
            accessibilityActions={[
              { name: 'mark-zone', label: 'Mark destination' },
            ]}
            accessibilityLabel="Accepting drop zone"
            canDrop={(ids) => {
              recordPredicate(ids);
              if (predicateError) {
                throw new Error('Scenario canDrop application error');
              }
              return acceptingEnabled;
            }}
            id="accepting"
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'mark-zone') {
                setAppActionCount((count) => count + 1);
              }
            }}
            style={[styles.dropZone, styles.dropPanel]}
          >
            <Text style={styles.dropZoneLabel}>Accepting</Text>
          </DropZone>
        ) : null}
        <DropZone
          accessibilityLabel="Rejecting drop zone"
          canDrop={(ids) => {
            recordPredicate(ids);
            return false;
          }}
          id="rejecting"
          style={[styles.dropZone, styles.dropPanel]}
        >
          <Text style={styles.dropZoneLabel}>Rejecting</Text>
        </DropZone>
      </View>
    </>
  );

  return (
    <>
      <Text style={styles.outcome}>
        Data: blue,green,yellow,pink (unchanged)
      </Text>
      <Text style={styles.outcome}>
        Selection: {selectionMode === 'multi' ? 'blue,yellow,pink' : 'green'}
      </Text>
      <Text style={styles.outcome}>Activation: {sourceId}</Text>
      <Text style={styles.outcome}>Drop callbacks: {callbackCount}</Text>
      <Text style={styles.outcome}>Last drop: {lastEvent}</Text>
      <Text style={styles.outcome}>
        Predicate calls: {predicateCount.current}
      </Text>
      <Text style={styles.outcome}>
        Predicate IDs: {lastPredicateIds.current}
      </Text>
      <Text style={styles.outcome}>App actions: {appActionCount}</Text>
      {__DEV__ && engine === 'auto' ? (
        <Text style={styles.outcome}>
          Native lifecycle: {nativeInteraction}
        </Text>
      ) : null}
      <View style={styles.scenarioActions}>
        <Pressable
          accessibilityLabel="Use single accessible drop selection"
          onPress={() => setSelectionMode('single')}
          style={styles.scenarioAction}
        >
          <Text style={styles.scenarioActionText}>Single selection</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Use multi accessible drop selection"
          onPress={() => setSelectionMode('multi')}
          style={styles.scenarioAction}
        >
          <Text style={styles.scenarioActionText}>Multi selection</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Target accepting zone"
          onPress={() => setDestinationId('accepting')}
          style={styles.scenarioAction}
        >
          <Text style={styles.scenarioActionText}>Target accepting</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Activate selected Pink card"
          onPress={() => setSourceId('pink')}
          style={styles.scenarioAction}
        >
          <Text style={styles.scenarioActionText}>Selected Pink</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Activate unselected Green card"
          onPress={() => setSourceId('green')}
          style={styles.scenarioAction}
        >
          <Text style={styles.scenarioActionText}>Unselected Green</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Target rejecting zone"
          onPress={() => setDestinationId('rejecting')}
          style={styles.scenarioAction}
        >
          <Text style={styles.scenarioActionText}>Target rejecting</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Toggle accepting zone visibility"
          onPress={() => setShowAccepting((value) => !value)}
          style={styles.scenarioAction}
        >
          <Text style={styles.scenarioActionText}>
            {showAccepting ? 'Hide accepting' : 'Show accepting'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Toggle throwing acceptance predicate"
          onPress={() => setPredicateError((value) => !value)}
          style={styles.scenarioAction}
        >
          <Text style={styles.scenarioActionText}>
            {predicateError ? 'Disable error' : 'Throw predicate'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Toggle accepting predicate"
          onPress={() => setAcceptingEnabled((value) => !value)}
          style={styles.scenarioAction}
        >
          <Text style={styles.scenarioActionText}>
            {acceptingEnabled ? 'Make reject' : 'Make accept'}
          </Text>
        </Pressable>
      </View>
      {__DEV__ ? (
        engine === 'fallback' ? (
          <FallbackDropAcceptanceContainer
            {...containerProps}
            actionContainerId="drop"
            actionRequest={actionRequest}
          >
            {content}
          </FallbackDropAcceptanceContainer>
        ) : (
          <NativeDropAcceptanceContainer
            {...containerProps}
            actionContainerId="drop"
            actionRequest={actionRequest}
            interactionStateChange={(active) => {
              nativeInteractionCount.current += 1;
              setNativeInteraction(
                `${active ? 'active' : 'inactive'} (${nativeInteractionCount.current})`
              );
            }}
          >
            {content}
          </NativeDropAcceptanceContainer>
        )
      ) : (
        <DragDropContainer {...containerProps} engine={engine}>
          {content}
        </DragDropContainer>
      )}
    </>
  );
}

export default function App() {
  const [demo, setDemo] = useState<Demo>('single');
  const [engine, setEngine] = useState<EnginePolicy>('auto');
  const actionRequest: SemanticActionRequest | null = null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.title}>Cards</Text>
        <DemoSelector demo={demo} onChange={setDemo} />
        <View accessibilityRole="radiogroup" style={styles.engineSelector}>
          {(['auto', 'fallback'] as const).map((policy) => {
            const selected = engine === policy;
            const label = policy === 'auto' ? 'Auto' : 'Fallback';
            return (
              <Pressable
                accessibilityLabel={`${label} engine policy`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={policy}
                onPress={() => setEngine(policy)}
                style={[
                  styles.engineOption,
                  selected && styles.engineOptionSelected,
                ]}
                testID={`engine-${policy}`}
              >
                <Text style={styles.engineOptionText}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.example}>
          {demo === 'single' && (
            <SingleCollectionExample engine={engine} key={engine} />
          )}
          {demo === 'sections' && (
            <SectionedCollectionExample engine={engine} key={engine} />
          )}
          {demo === 'drop' && (
            <DragDropExample
              actionRequest={actionRequest}
              engine={engine}
              key={engine}
            />
          )}
          {demo === 'scale' && (
            <ScaleListExample engine={engine} key={engine} />
          )}
          {demo === 'variable' && (
            <VariableListExample engine={engine} key={engine} />
          )}
          {demo === 'flash' && (
            <FlashListIntegrations engine={engine} key={engine} />
          )}
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  styledSectionContent: {
    paddingBottom: 18,
    paddingTop: '10%',
    rowGap: 7,
  },
  root: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 16,
    paddingTop: 72,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 14,
  },
  demoSelector: {
    alignSelf: 'stretch',
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    flexDirection: 'row',
    marginBottom: 18,
    padding: 3,
  },
  demoTab: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
  },
  demoTabSelected: {
    backgroundColor: '#3A3A3C',
  },
  demoTabText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  demoTabTextSelected: {
    color: '#FFFFFF',
  },
  example: {
    flex: 1,
  },
  engineSelector: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 12,
  },
  flashControls: {
    flexWrap: 'nowrap',
    gap: 4,
  },
  flashScenarioAction: {
    paddingHorizontal: 4,
  },
  flashScenarioActionText: {
    fontSize: 9,
  },
  engineOption: {
    borderColor: '#636366',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  engineOptionSelected: {
    backgroundColor: '#3A3A3C',
    borderColor: '#FFFFFF',
  },
  engineOptionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  verticalCards: {
    gap: 6,
    width: '100%',
  },
  scaleList: {
    flex: 1,
    marginTop: 8,
  },
  scaleRow: {
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderBottomColor: '#48484A',
    borderBottomWidth: 1,
    height: SCALE_ITEM_HEIGHT,
    justifyContent: 'center',
  },
  scaleRowLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  variableHeight: {
    color: '#8E8E93',
    fontSize: 11,
  },
  variableRow: {
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderBottomColor: '#48484A',
    borderBottomWidth: 1,
    justifyContent: 'center',
  },
  scaleScenario: {
    flex: 1,
  },
  card: {
    alignItems: 'center',
    borderRadius: 10,
    height: 54,
    justifyContent: 'center',
    width: '100%',
  },
  expandedCard: {
    height: 96,
  },
  reorderSelected: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
  },
  scenarioActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  scenarioAction: {
    borderColor: '#636366',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  scenarioActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  cardLabel: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  nestedAction: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  outcome: {
    color: '#D1D1D6',
    fontSize: 12,
    marginBottom: 6,
  },
  sectionedCards: {
    gap: 12,
    width: '100%',
  },
  cardSection: {
    gap: 6,
    width: '100%',
  },
  sectionTitle: {
    color: '#D1D1D6',
    fontSize: 12,
    textAlign: 'center',
  },
  sectionFooter: {
    color: '#8E8E93',
    fontSize: 11,
    textAlign: 'center',
  },
  sectionScaleFooter: {
    backgroundColor: '#1C1C1E',
    height: 24,
    justifyContent: 'center',
  },
  sectionScaleHeader: {
    backgroundColor: '#242426',
    height: 32,
    justifyContent: 'center',
  },
  sectionScaleRow: {
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderBottomColor: '#48484A',
    borderBottomWidth: 1,
    justifyContent: 'center',
  },
  dragLayout: {
    alignContent: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    width: '100%',
  },
  dragSourcePanel: {
    width: '100%',
  },
  dragItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dropPanels: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  dropPanel: {
    flex: 1,
    width: undefined,
  },
  gridCard: {
    borderRadius: 8,
    flex: 1,
  },
  blueCard: {
    backgroundColor: '#0A84FF',
  },
  draggableItem: {
    height: 54,
    width: '31%',
  },
  gridCardSelected: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
  },
  dropZone: {
    alignItems: 'stretch',
    borderColor: '#636366',
    borderRadius: 10,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 122,
    padding: 8,
    width: '100%',
  },
  dropZoneLabel: {
    color: '#8E8E93',
    fontSize: 12,
    textAlign: 'center',
  },
  droppedCards: {
    gap: 6,
  },
  droppedCard: {
    borderRadius: 8,
    height: 48,
    width: '100%',
  },
});
