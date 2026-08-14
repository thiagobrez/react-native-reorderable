import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { EnginePolicy, ReorderEvent } from 'react-native-reorderable';
import { scenarioLink, type AreaId, type ScenarioId } from './scenario-catalog';
import { styles } from './theme';

export type PublicOutcome = Readonly<{
  order: string;
  selection: string;
  event: string;
  callbackCount: number;
}>;

export function formatReorderEvent(
  event: Pick<ReorderEvent, 'sourceIds' | 'destination'>
): string {
  return JSON.stringify({
    sourceIds: event.sourceIds,
    destination: event.destination,
  });
}

export function Action({
  id,
  label,
  onPress,
  danger = false,
}: Readonly<{
  id: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}>) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.action, danger && styles.actionDanger]}
      testID={id}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

export function ScenarioFrame({
  area,
  children,
  engine,
  onBack,
  onEngineChange,
  onReset,
  outcome,
  preset,
  scenario,
  title,
}: Readonly<{
  area: AreaId;
  children: ReactNode;
  engine: EnginePolicy;
  onBack: () => void;
  onEngineChange?: (engine: EnginePolicy) => void;
  onReset: () => void;
  outcome: PublicOutcome;
  preset: string;
  scenario: ScenarioId;
  title: string;
}>) {
  const prefix = `scenario-${scenario}`;
  return (
    <View style={styles.page} testID={prefix}>
      <Pressable
        accessibilityLabel="Back to scenario catalog"
        accessibilityRole="button"
        onPress={onBack}
        style={styles.back}
        testID="scenario-back"
      >
        <Text style={styles.backText}>
          ‹ All {area === 'lab' ? 'Scenario Lab' : area}
        </Text>
      </Pressable>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.link} testID={`${prefix}-deep-link`}>
          {scenarioLink(area, scenario, engine, preset)}
        </Text>
      </View>
      {onEngineChange ? (
        <View
          accessibilityRole="radiogroup"
          style={styles.engineRow}
          testID="lab-engine-policy"
        >
          {(['auto', 'fallback'] as const).map((policy) => (
            <Pressable
              accessibilityLabel={`${policy === 'auto' ? 'Auto' : 'Fallback'} engine policy`}
              accessibilityRole="radio"
              accessibilityState={{ checked: engine === policy }}
              key={policy}
              onPress={() => onEngineChange(policy)}
              style={[styles.pill, engine === policy && styles.pillSelected]}
              testID={`engine-${policy}`}
            >
              <Text style={styles.pillText}>
                {policy === 'auto' ? 'Auto' : 'Fallback'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Action id={`${prefix}-reset`} label="Reset" onPress={onReset} />
      </View>
      <View
        accessibilityLabel={`Public scenario outcome. Current order: ${outcome.order}. Current selection: ${outcome.selection}. Last committed event: ${outcome.event}. Callback count: ${outcome.callbackCount}`}
        style={styles.status}
        testID={`${prefix}-outcome`}
      >
        <ScrollView
          accessibilityLabel="Scrollable current order"
          nestedScrollEnabled
          showsVerticalScrollIndicator
          style={styles.orderViewport}
          testID={`${prefix}-order-scroll`}
        >
          <Text
            accessibilityLabel={`Current order: ${outcome.order}`}
            selectable
            style={styles.statusText}
            testID={`${prefix}-order`}
          >
            Order: {outcome.order}
          </Text>
        </ScrollView>
        <Text
          accessibilityLabel={`Current selection: ${outcome.selection}`}
          style={styles.statusText}
          testID={`${prefix}-selection`}
        >
          Selection: {outcome.selection}
        </Text>
        <Text
          accessibilityLabel={`Last committed event: ${outcome.event}`}
          numberOfLines={2}
          style={styles.statusText}
          testID={`${prefix}-last-event`}
        >
          Last committed event: {outcome.event}
        </Text>
        <Text
          accessibilityLabel={`Callback count: ${outcome.callbackCount}`}
          style={styles.statusText}
          testID={`${prefix}-callback-count`}
        >
          Callback count: {outcome.callbackCount}
        </Text>
      </View>
      <View style={styles.canvas}>{children}</View>
    </View>
  );
}
