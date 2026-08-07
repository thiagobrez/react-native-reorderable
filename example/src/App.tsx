import { useMemo, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  DragContainer,
  DraggableItem,
  DropZone,
  ReorderableContainer,
  ReorderableItem,
  ReorderableSection,
  type ReorderEvent,
  type EnginePolicy,
} from 'react-native-reorderable';
import { NativeCommitAcceptanceContainer } from '../../src/issue25-acceptance';
import { FallbackCommitAcceptanceContainer } from '../../src/issue26-acceptance';

type Card = Readonly<{
  color: string;
  id: string;
  label: string;
}>;

type CardSection = Readonly<{
  cards: readonly Card[];
  id: string;
  title: string;
}>;

type Demo = 'single' | 'sections' | 'multi';

const initialCards: readonly Card[] = [
  { id: 'blue', label: 'Blue', color: '#0A84FF' },
  { id: 'green', label: 'Green', color: '#30D158' },
  { id: 'yellow', label: 'Yellow', color: '#FFD60A' },
  { id: 'orange', label: 'Orange', color: '#FF9F0A' },
  { id: 'pink', label: 'Pink', color: '#FF375F' },
];

const initialSections: readonly CardSection[] = [
  {
    id: 'favorites',
    title: 'Favorites',
    cards: initialCards.slice(0, 3),
  },
  { id: 'others', title: 'Others', cards: initialCards.slice(3) },
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
          ['multi', 'Multi-drag'],
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

function SingleCollectionExample({ engine }: { engine: EnginePolicy }) {
  const [cards, setCards] = useState(initialCards);
  const [callbackCount, setCallbackCount] = useState(0);
  const [nestedPressCount, setNestedPressCount] = useState(0);

  const handleReorder = (event: ReorderEvent) => {
    const itemIds = event.nextOrder[0]?.itemIds;
    if (itemIds) {
      setCards((current) => itemsInOrder(current, itemIds));
      setCallbackCount((current) => current + 1);
    }
  };

  const renderedCards = cards.map((card, index) => (
    <ReorderableItem
      accessibilityLabel={`${card.label} card, position ${index + 1}`}
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
      {__DEV__ && engine === 'auto' ? (
        <NativeCommitAcceptanceContainer
          acceptanceMove={{
            sourceIds: ['yellow'],
            destination: { sectionId: null, beforeId: 'green' },
          }}
          accessibilityLabel="Single collection cards"
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

function SectionedCollectionExample() {
  const [sections, setSections] = useState(initialSections);

  const handleReorder = (event: ReorderEvent) => {
    setSections((current) => {
      const cardsById = new Map(
        current
          .flatMap((section) => section.cards)
          .map((card) => [card.id, card])
      );
      const sectionsById = new Map(
        current.map((section) => [section.id, section])
      );
      return event.nextOrder.flatMap((order) => {
        if (order.sectionId == null) return [];
        const section = sectionsById.get(order.sectionId);
        if (!section) return [];
        return [
          {
            ...section,
            cards: order.itemIds.flatMap((id) => {
              const card = cardsById.get(id);
              return card ? [card] : [];
            }),
          },
        ];
      });
    });
  };

  return (
    <ReorderableContainer
      accessibilityLabel="Sectioned cards"
      onReorder={handleReorder}
      style={styles.sectionedCards}
      testID="sections-container"
    >
      {sections.map((section) => (
        <ReorderableSection
          header={<Text style={styles.sectionTitle}>{section.title}</Text>}
          footer={
            <Text style={styles.sectionFooter}>
              {section.cards.length} cards
            </Text>
          }
          id={section.id}
          key={section.id}
          style={styles.cardSection}
        >
          {section.cards.map((card, index) => (
            <ReorderableItem
              accessibilityLabel={`${card.label} card, ${section.title} position ${index + 1}`}
              id={card.id}
              key={card.id}
              style={[styles.card, { backgroundColor: card.color }]}
              testID={`section-card-${card.id}`}
            >
              <Text style={styles.cardLabel}>{card.label}</Text>
            </ReorderableItem>
          ))}
        </ReorderableSection>
      ))}
    </ReorderableContainer>
  );
}

function MultiItemDragExample() {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [droppedIds, setDroppedIds] = useState<readonly string[]>([]);
  const cardsById = useMemo(
    () => new Map(initialCards.map((card) => [card.id, card])),
    []
  );
  const droppedCards = droppedIds.flatMap((id) => {
    const card = cardsById.get(id);
    return card ? [card] : [];
  });
  const toggleSelection = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    );
  };

  return (
    <DragContainer
      accessibilityLabel="Draggable cards and drop zone"
      onDrop={({ itemIds }) => {
        setDroppedIds(itemIds);
        setSelectedIds([]);
      }}
      selectedIds={selectedIds}
      style={styles.dragLayout}
      testID="multi-container"
    >
      {initialCards.map((card) => {
        const selected = selectedIds.includes(card.id);
        return (
          <DraggableItem
            id={card.id}
            key={card.id}
            style={styles.draggableItem}
          >
            <Pressable
              accessibilityLabel={`${card.label} source card`}
              accessibilityState={{ selected }}
              onPress={() => toggleSelection(card.id)}
              style={[
                styles.gridCard,
                { backgroundColor: card.color },
                selected && styles.gridCardSelected,
              ]}
              testID={`source-card-${card.id}`}
            />
          </DraggableItem>
        );
      })}
      <DropZone
        accessibilityLabel="Drop cards here"
        id="cards-drop-zone"
        style={styles.dropZone}
        testID="cards-drop-zone"
      >
        {droppedCards.length === 0 ? (
          <Text style={styles.dropZoneLabel}>Drop cards here</Text>
        ) : (
          <View style={styles.droppedCards}>
            {droppedCards.map((card) => (
              <View
                accessibilityLabel={`${card.label} dropped card`}
                key={card.id}
                style={[styles.droppedCard, { backgroundColor: card.color }]}
                testID={`dropped-card-${card.id}`}
              />
            ))}
          </View>
        )}
      </DropZone>
    </DragContainer>
  );
}

export default function App() {
  const [demo, setDemo] = useState<Demo>('single');
  const [engine, setEngine] = useState<EnginePolicy>('auto');

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
          {demo === 'sections' && <SectionedCollectionExample />}
          {demo === 'multi' && <MultiItemDragExample />}
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
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
    gap: 8,
    marginBottom: 12,
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
  card: {
    alignItems: 'center',
    borderRadius: 10,
    height: 54,
    justifyContent: 'center',
    width: '100%',
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
  dragLayout: {
    alignContent: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    width: '100%',
  },
  gridCard: {
    borderRadius: 8,
    flex: 1,
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
