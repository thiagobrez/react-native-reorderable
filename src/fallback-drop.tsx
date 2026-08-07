import {
  useCallback,
  cloneElement,
  useEffect,
  useMemo,
  useRef,
  type ReactElement,
} from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import {
  AppState,
  BackHandler,
  Button,
  Platform,
  StyleSheet,
  type HostInstance,
  type ViewProps,
} from 'react-native';

import type { EntryKind } from './normalize';

type Slot = Readonly<{ height: number; width: number; x: number; y: number }>;
type Terminal = Readonly<{
  accepted: boolean;
  destinationId: string;
  itemIds: readonly string[];
}> | null;
type TerminalCandidate = Readonly<{
  destinationId: string;
  itemIds: readonly string[];
}> | null;

type State = Readonly<{
  acceptedZoneIds: SharedValue<string[]>;
  active: SharedValue<boolean>;
  activeIds: SharedValue<string[]>;
  destinationId: SharedValue<string>;
  layouts: SharedValue<Slot[]>;
  terminalClaimed: SharedValue<boolean>;
  translationX: SharedValue<number>;
  translationY: SharedValue<number>;
}>;

function clear(state: State) {
  'worklet';
  state.active.value = false;
  state.activeIds.value = [];
  state.acceptedZoneIds.value = [];
  state.destinationId.value = '';
  state.translationX.value = 0;
  state.translationY.value = 0;
}

function finish(
  state: State,
  valid: boolean,
  onTerminal: (event: TerminalCandidate) => void
) {
  'worklet';
  if (!state.active.value || state.terminalClaimed.value) return;
  state.terminalClaimed.value = true;
  const destinationId = state.destinationId.value;
  scheduleOnRN(
    onTerminal,
    valid && destinationId.length > 0
      ? {
          destinationId,
          itemIds: state.activeIds.value,
        }
      : null
  );
}

function updateDestination(
  absoluteX: number,
  absoluteY: number,
  entryIds: readonly string[],
  entryKinds: readonly EntryKind[],
  state: State
) {
  'worklet';
  let destination = '';
  for (let index = 0; index < entryIds.length; index++) {
    if (entryKinds[index] !== 'dropZone') continue;
    const slot = state.layouts.value[index];
    if (
      slot != null &&
      absoluteX >= slot.x &&
      absoluteX <= slot.x + slot.width &&
      absoluteY >= slot.y &&
      absoluteY <= slot.y + slot.height
    ) {
      destination = entryIds[index] ?? '';
      break;
    }
  }
  state.destinationId.value = destination;
}

function DragEntry({
  child,
  entryIds,
  entryKinds,
  id,
  index,
  moveSet,
  onActivate,
  onTerminal,
  state,
}: Readonly<{
  child: ReactElement;
  entryIds: readonly string[];
  entryKinds: readonly EntryKind[];
  id: string;
  index: number;
  moveSet: readonly string[];
  onActivate: (ids: readonly string[]) => void;
  onTerminal: (event: TerminalCandidate) => void;
  state: State;
}>) {
  const ref = useAnimatedRef<HostInstance>();
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(`fallback-drag-item-${id}`)
        .activateAfterLongPress(350)
        .onStart((event) => {
          state.active.value = true;
          state.terminalClaimed.value = false;
          state.activeIds.value = [...moveSet];
          scheduleOnRN(onActivate, moveSet);
          updateDestination(
            event.absoluteX,
            event.absoluteY,
            entryIds,
            entryKinds,
            state
          );
        })
        .onUpdate((event) => {
          state.translationX.value = event.translationX;
          state.translationY.value = event.translationY;
          updateDestination(
            event.absoluteX,
            event.absoluteY,
            entryIds,
            entryKinds,
            state
          );
        })
        .onEnd((event) => {
          updateDestination(
            event.absoluteX,
            event.absoluteY,
            entryIds,
            entryKinds,
            state
          );
          finish(state, true, onTerminal);
        })
        .onFinalize((_event, success) => {
          if (!success) finish(state, false, onTerminal);
          clear(state);
        }),
    [entryIds, entryKinds, id, moveSet, onActivate, onTerminal, state]
  );
  const style = useAnimatedStyle(() =>
    state.activeIds.value.includes(id)
      ? {
          elevation: 8,
          opacity: 0.94,
          transform: [
            { translateX: state.translationX.value },
            { translateY: state.translationY.value },
            { scale: withTiming(1.03, { duration: 100 }) },
          ],
          zIndex: 3,
        }
      : {}
  );
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        onLayout={() => {
          scheduleOnUI(() => {
            'worklet';
            const frame = measure(ref);
            if (frame == null) return;
            state.layouts.modify((current) => {
              current[index] = {
                height: frame.height,
                width: frame.width,
                x: frame.pageX,
                y: frame.pageY,
              };
              return current;
            });
          });
        }}
        ref={ref}
        style={style}
      >
        {child}
      </Animated.View>
    </GestureDetector>
  );
}

function ZoneEntry({
  child,
  id,
  index,
  state,
}: Readonly<{
  child: ReactElement;
  id: string;
  index: number;
  state: State;
}>) {
  const ref = useAnimatedRef<HostInstance>();
  const childStyle = StyleSheet.flatten(
    (child.props as { style?: ViewProps['style'] }).style
  );
  const style = useAnimatedStyle(() => {
    const targeted = state.active.value && state.destinationId.value === id;
    const accepted = state.acceptedZoneIds.value.includes(id);
    return targeted
      ? {
          borderColor: accepted ? '#22c55e' : '#ef4444',
          borderWidth: 3,
          opacity: accepted ? 1 : 0.72,
        }
      : {};
  });
  return (
    <Animated.View
      onLayout={() => {
        scheduleOnUI(() => {
          'worklet';
          const frame = measure(ref);
          if (frame == null) return;
          state.layouts.modify((current) => {
            current[index] = {
              height: frame.height,
              width: frame.width,
              x: frame.pageX,
              y: frame.pageY,
            };
            return current;
          });
        });
      }}
      ref={ref}
      style={[
        {
          borderRadius: childStyle?.borderRadius,
          flex: childStyle?.flex,
          minHeight: childStyle?.minHeight,
        },
        style,
      ]}
      testID={`fallback-drop-zone-${id}`}
    >
      {child}
    </Animated.View>
  );
}

export type FallbackDropContainerProps = ViewProps &
  Readonly<{
    canDropById: ReadonlyMap<
      string,
      ((ids: readonly string[]) => boolean) | undefined
    >;
    children: readonly ReactElement[];
    debugMove?: Readonly<{ sourceId: string; destinationId: string }>;
    entryIds: readonly string[];
    entryKinds: readonly EntryKind[];
    parentEntryIds: readonly string[];
    onDropTerminal: (event: Terminal) => void;
  }>;

export function FallbackDropContainer({
  canDropById,
  children,
  debugMove,
  entryIds,
  entryKinds,
  parentEntryIds,
  onDropTerminal,
  ...viewProps
}: FallbackDropContainerProps) {
  const current: State = {
    acceptedZoneIds: useSharedValue<string[]>([]),
    active: useSharedValue(false),
    activeIds: useSharedValue<string[]>([]),
    destinationId: useSharedValue(''),
    layouts: useSharedValue<Slot[]>([]),
    terminalClaimed: useSharedValue(false),
    translationX: useSharedValue(0),
    translationY: useSharedValue(0),
  };
  const state = useRef(current).current;
  const activeRef = useRef(false);
  const pendingTerminalRef = useRef<TerminalCandidate | undefined>(undefined);
  const snapshotRef = useRef<readonly string[]>([]);
  const completeTerminal = useCallback(
    (event: TerminalCandidate) => {
      if (!activeRef.current) {
        pendingTerminalRef.current = event;
        return;
      }
      activeRef.current = false;
      onDropTerminal(
        event == null
          ? null
          : {
              ...event,
              accepted: snapshotRef.current.includes(event.destinationId),
            }
      );
      scheduleOnUI(() => {
        'worklet';
        clear(state);
      });
    },
    [onDropTerminal, state]
  );
  const onActivate = useCallback(
    (ids: readonly string[]) => {
      activeRef.current = false;
      snapshotRef.current = [];
      state.acceptedZoneIds.value = [];
      const accepted: string[] = [];
      try {
        for (const [zoneId, predicate] of canDropById) {
          if (
            (predicate ?? ((known: readonly string[]) => known.length > 0))(ids)
          ) {
            accepted.push(zoneId);
          }
        }
      } catch (error) {
        pendingTerminalRef.current = undefined;
        scheduleOnUI(() => {
          'worklet';
          clear(state);
        });
        throw error;
      }
      activeRef.current = true;
      snapshotRef.current = accepted;
      state.acceptedZoneIds.value = accepted;
      if (pendingTerminalRef.current !== undefined) {
        const pendingTerminal = pendingTerminalRef.current;
        pendingTerminalRef.current = undefined;
        completeTerminal(pendingTerminal);
      }
    },
    [canDropById, completeTerminal, state]
  );
  const cancel = useCallback(() => {
    pendingTerminalRef.current = undefined;
    if (!activeRef.current) return false;
    activeRef.current = false;
    scheduleOnUI(() => {
      'worklet';
      clear(state);
    });
    return true;
  }, [state]);
  useEffect(() => {
    const change = AppState.addEventListener('change', (next) => {
      if (next !== 'active') cancel();
    });
    const blur =
      Platform.OS === 'android'
        ? AppState.addEventListener('blur', cancel)
        : null;
    const back =
      Platform.OS === 'android'
        ? BackHandler.addEventListener('hardwareBackPress', cancel)
        : null;
    return () => {
      change.remove();
      blur?.remove();
      back?.remove();
      cancel();
    };
  }, [cancel]);

  const activateDebug = () => {
    if (debugMove == null) return;
    state.active.value = true;
    state.terminalClaimed.value = false;
    state.activeIds.value = [debugMove.sourceId];
    onActivate([debugMove.sourceId]);
  };
  return (
    <Animated.View {...viewProps} style={[styles.container, viewProps.style]}>
      {debugMove == null ? null : (
        <>
          <Button
            accessibilityLabel="Activate fallback drop"
            onPress={activateDebug}
            title="Activate fallback drop"
          />
          <Button
            accessibilityLabel="Move fallback drop destination"
            onPress={() => {
              state.destinationId.value = debugMove.destinationId;
            }}
            title="Move fallback drop destination"
          />
          <Button
            accessibilityLabel="Commit fallback drop"
            onPress={() => {
              if (!activeRef.current) return;
              const destinationId = state.destinationId.value;
              completeTerminal(
                destinationId
                  ? {
                      destinationId,
                      itemIds: state.activeIds.value,
                    }
                  : null
              );
              clear(state);
            }}
            title="Commit fallback drop"
          />
          <Button
            accessibilityLabel="Release fallback drop outside"
            onPress={() => {
              completeTerminal(null);
              clear(state);
            }}
            title="Release fallback drop outside"
          />
        </>
      )}
      {children.map((child, index) => {
        if ((parentEntryIds[index] ?? '') !== '') return null;
        const renderEntry = (
          entryChild: ReactElement,
          entryIndex: number
        ): ReactElement => {
          const nested = children.flatMap((candidate, candidateIndex) =>
            parentEntryIds[candidateIndex] === entryIds[entryIndex]
              ? [renderEntry(candidate, candidateIndex)]
              : []
          );
          if (entryKinds[entryIndex] === 'layout') {
            return cloneElement(
              entryChild,
              { key: entryIds[entryIndex] },
              nested
            );
          }
          if (entryKinds[entryIndex] === 'content') return entryChild;
          const id = entryIds[entryIndex] ?? '';
          if (entryKinds[entryIndex] === 'item') {
            return (
              <DragEntry
                child={entryChild}
                entryIds={entryIds}
                entryKinds={entryKinds}
                id={id}
                index={entryIndex}
                key={`item:${id}`}
                moveSet={[id]}
                onActivate={onActivate}
                onTerminal={completeTerminal}
                state={state}
              />
            );
          }
          return (
            <ZoneEntry
              child={entryChild}
              id={id}
              index={entryIndex}
              key={`zone:${id}`}
              state={state}
            />
          );
        };
        return renderEntry(child, index);
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ container: { position: 'relative' } });
