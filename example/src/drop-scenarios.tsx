import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import {
  DragDropContainer,
  DraggableItem,
  DropZone,
  ReorderableContainer,
  ReorderableItem,
  type DropEvent,
  type EnginePolicy,
  type ReorderEvent,
} from 'react-native-reorderable';
import { Action, formatReorderEvent, type PublicOutcome } from './components';
import { styles } from './theme';

type Props = Readonly<{
  engine: EnginePolicy;
  onOutcome: (outcome: PublicOutcome) => void;
  resetToken: number;
}>;

const itemIds = ['blue', 'green', 'yellow'] as const;

export function DropScenario({ engine, onOutcome, resetToken }: Props) {
  const [count, setCount] = useState(0);
  const [event, setEvent] = useState('None');
  const [showAccepting, setShowAccepting] = useState(true);
  useEffect(() => {
    setCount(0);
    setEvent('None');
    setShowAccepting(true);
  }, [resetToken]);
  useEffect(
    () =>
      onOutcome({
        order: itemIds.join(', '),
        selection: 'blue, yellow',
        event,
        callbackCount: count,
      }),
    [count, event, onOutcome]
  );
  const selectedIds = useMemo(() => ['blue', 'yellow'], []);
  const handleDrop = (drop: DropEvent) => {
    setCount((value) => value + 1);
    setEvent(JSON.stringify(drop));
  };
  return (
    <>
      <Text style={styles.instruction}>
        Long-press a card and release over a visible zone. The rejecting zone
        never commits.
      </Text>
      <View style={styles.actions}>
        <Action
          id="drop-zone-visibility"
          label={
            showAccepting ? 'Unmount accepting zone' : 'Mount accepting zone'
          }
          onPress={() => setShowAccepting((value) => !value)}
        />
      </View>
      <DragDropContainer
        accessibilityLabel="Cross-panel drag and drop"
        engine={engine}
        onDrop={handleDrop}
        selectedIds={selectedIds}
        style={styles.dropLayout}
        testID="drop-container"
      >
        <View style={styles.sourcePanel}>
          <View style={styles.sourceRow}>
            {itemIds.map((id) => (
              <DraggableItem
                accessibilityLabel={`${id} draggable card${selectedIds.includes(id) ? ', selected' : ''}`}
                id={id}
                key={id}
                style={styles.draggable}
                testID={`draggable-${id}`}
              >
                <View
                  style={[
                    styles.card,
                    selectedIds.includes(id) && styles.cardSelected,
                  ]}
                >
                  <Text style={styles.cardText}>{id}</Text>
                  <Text style={styles.grip}>⠿</Text>
                </View>
              </DraggableItem>
            ))}
          </View>
        </View>
        {showAccepting ? (
          <DropZone
            accessibilityLabel="Accepting drop zone"
            canDrop={() => true}
            id="accepting"
            style={styles.zone}
            testID="drop-zone-accepting"
          >
            <Text style={styles.zoneText}>
              Accepting{`\n`}Drop selected items here
            </Text>
          </DropZone>
        ) : null}
        <DropZone
          accessibilityLabel="Rejecting drop zone"
          canDrop={() => false}
          id="rejecting"
          style={[styles.zone, styles.zoneReject]}
          testID="drop-zone-rejecting"
        >
          <Text style={styles.zoneText}>Rejecting</Text>
        </DropZone>
      </DragDropContainer>
    </>
  );
}

export function CancellationScenario({ engine, onOutcome, resetToken }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [mounted, setMounted] = useState(true);
  const [order, setOrder] = useState(itemIds as readonly string[]);
  const [count, setCount] = useState(0);
  const [event, setEvent] = useState('None');
  const [armed, setArmed] = useState<'none' | 'disable' | 'unmount'>('none');
  const lifecycleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setEnabled(true);
    setMounted(true);
    setOrder(itemIds);
    setCount(0);
    setEvent('None');
    setArmed('none');
    if (lifecycleTimer.current) clearTimeout(lifecycleTimer.current);
  }, [resetToken]);
  useEffect(
    () => () => {
      if (lifecycleTimer.current) clearTimeout(lifecycleTimer.current);
    },
    []
  );
  useEffect(
    () =>
      onOutcome({
        order: order.join(', '),
        selection: 'none',
        event,
        callbackCount: count,
      }),
    [count, event, onOutcome, order]
  );
  const commit = (result: ReorderEvent) => {
    setOrder(result.nextOrder[0]?.itemIds ?? order);
    setCount((value) => value + 1);
    setEvent(formatReorderEvent(result));
  };
  const armLifecycleChange = (change: 'disable' | 'unmount') => {
    if (lifecycleTimer.current) clearTimeout(lifecycleTimer.current);
    setEnabled(true);
    setMounted(true);
    setArmed(change);
    lifecycleTimer.current = setTimeout(() => {
      if (change === 'disable') setEnabled(false);
      else setMounted(false);
      setArmed('none');
      lifecycleTimer.current = null;
    }, 1800);
  };
  return (
    <>
      <Text style={styles.instruction}>
        Disable or unmount the live container during a long press. The armed
        controls schedule that same lifecycle change for a hands-free hold. A
        cancelled reorder leaves all public outcomes unchanged.
      </Text>
      <View style={styles.actions}>
        <Action
          danger
          id="cancellation-disable"
          label={enabled ? 'Disable container' : 'Enable container'}
          onPress={() => setEnabled((value) => !value)}
        />
        <Action
          danger
          id="cancellation-unmount"
          label={mounted ? 'Unmount container' : 'Mount container'}
          onPress={() => setMounted((value) => !value)}
        />
        <Action
          danger
          id="cancellation-arm-disable"
          label={
            armed === 'disable' ? 'Disable armed' : 'Arm disable during hold'
          }
          onPress={() => armLifecycleChange('disable')}
        />
        <Action
          danger
          id="cancellation-arm-unmount"
          label={
            armed === 'unmount' ? 'Unmount armed' : 'Arm unmount during hold'
          }
          onPress={() => armLifecycleChange('unmount')}
        />
      </View>
      {mounted ? (
        <ReorderableContainer
          accessibilityLabel="Lifecycle cancellation cards"
          enabled={enabled}
          engine={engine}
          onReorder={commit}
          style={styles.cards}
          testID="cancellation-container"
        >
          {order.map((id) => (
            <ReorderableItem
              accessibilityLabel={`${id} cancellation card`}
              id={id}
              key={id}
              style={styles.card}
              testID={`cancellation-${id}`}
            >
              <Text style={styles.cardText}>{id}</Text>
              <Text style={styles.grip}>⠿</Text>
            </ReorderableItem>
          ))}
        </ReorderableContainer>
      ) : (
        <Text
          accessibilityRole="alert"
          style={styles.instruction}
          testID="cancellation-unmounted"
        >
          Container unmounted
        </Text>
      )}
    </>
  );
}

export function AccessibilityScenario({
  engine,
  onOutcome,
  resetToken,
}: Props) {
  const [order, setOrder] = useState(itemIds as readonly string[]);
  const [count, setCount] = useState(0);
  const [event, setEvent] = useState('None');
  useEffect(() => {
    setOrder(itemIds);
    setCount(0);
    setEvent('None');
  }, [resetToken]);
  useEffect(
    () =>
      onOutcome({
        order: order.join(', '),
        selection: 'blue, green',
        event,
        callbackCount: count,
      }),
    [count, event, onOutcome, order]
  );
  return (
    <>
      <Text style={styles.instruction}>
        With VoiceOver or TalkBack, focus a selected card and invoke Move
        earlier/later. Focus the zone and invoke Drop selected items here. These
        are the library’s real semantic actions.
      </Text>
      <ReorderableContainer
        accessibilityLabel="Accessible reorder cards"
        engine={engine}
        onReorder={(result) => {
          setOrder(result.nextOrder[0]?.itemIds ?? order);
          setCount((value) => value + 1);
          setEvent(formatReorderEvent(result));
        }}
        selectedIds={['blue', 'green']}
        style={styles.cards}
        testID="accessibility-reorder-container"
      >
        {order.map((id) => (
          <ReorderableItem
            accessibilityLabel={`${id} accessible card${id !== 'yellow' ? ', selected' : ''}`}
            id={id}
            key={id}
            style={[styles.card, id !== 'yellow' && styles.cardSelected]}
            testID={`accessible-${id}`}
          >
            <Text style={styles.cardText}>{id}</Text>
            <Text style={styles.grip}>⠿</Text>
          </ReorderableItem>
        ))}
      </ReorderableContainer>
      <DragDropContainer
        accessibilityLabel="Accessible drop example"
        engine={engine}
        onDrop={(drop) => {
          setCount((value) => value + 1);
          setEvent(JSON.stringify(drop));
        }}
        selectedIds={['blue', 'green']}
        style={[styles.dropLayout, styles.accessibilityDropLayout]}
        testID="accessibility-drop-container"
      >
        <DraggableItem
          accessibilityLabel="blue accessible draggable"
          id="blue"
          style={styles.draggable}
        >
          <View style={styles.card}>
            <Text style={styles.cardText}>blue</Text>
          </View>
        </DraggableItem>
        <DraggableItem
          accessibilityLabel="green accessible draggable"
          id="green"
          style={styles.draggable}
        >
          <View style={styles.card}>
            <Text style={styles.cardText}>green</Text>
          </View>
        </DraggableItem>
        <DropZone
          accessibilityLabel="Accessible accepting drop zone"
          id="accessible-zone"
          style={styles.zone}
          testID="accessible-drop-zone"
        >
          <Text style={styles.zoneText}>Accessible destination</Text>
        </DropZone>
      </DragDropContainer>
    </>
  );
}
