import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import type { EnginePolicy } from 'react-native-reorderable';
import { ScenarioFrame, type PublicOutcome } from './components';
import {
  AccessibilityScenario,
  CancellationScenario,
  DropScenario,
} from './drop-scenarios';
import { IntegrationScenario } from './integration-scenarios';
import {
  FlatScenario,
  FreeFormScenario,
  SectionScenario,
} from './reorder-scenarios';
import {
  AREAS,
  defaultPresetFor,
  parseExampleLink,
  type AreaId,
  type ScenarioDefinition,
  type ScenarioId,
} from './scenario-catalog';
import { styles } from './theme';

const EMPTY_OUTCOME: PublicOutcome = {
  order: 'Seeded initial order',
  selection: 'none',
  event: 'None',
  callbackCount: 0,
};

function Catalog({
  area,
  onAreaChange,
  onOpen,
}: Readonly<{
  area: AreaId;
  onAreaChange: (area: AreaId) => void;
  onOpen: (scenario: ScenarioId) => void;
}>) {
  const definition = AREAS.find((candidate) => candidate.id === area)!;
  return (
    <View style={styles.page} testID={`area-${area}`}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>react-native-reorderable</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {definition.title}
        </Text>
        <Text style={styles.subtitle}>
          {area === 'examples'
            ? 'Small, polished guides to the public API.'
            : area === 'lab'
              ? 'Deterministic, observable behavioral scenarios.'
              : 'Focused optional-provider examples.'}
        </Text>
      </View>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {AREAS.map((candidate) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: candidate.id === area }}
            key={candidate.id}
            onPress={() => onAreaChange(candidate.id)}
            style={[styles.tab, candidate.id === area && styles.tabSelected]}
            testID={`area-tab-${candidate.id}`}
          >
            <Text
              style={[
                styles.tabText,
                candidate.id === area && styles.tabTextSelected,
              ]}
            >
              {candidate.title}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={styles.catalog}
        testID={`${area}-scenario-catalog`}
      >
        {definition.scenarios.map((scenario) => (
          <CatalogCard key={scenario.id} onOpen={onOpen} scenario={scenario} />
        ))}
      </ScrollView>
    </View>
  );
}

function CatalogCard({
  onOpen,
  scenario,
}: Readonly<{
  onOpen: (scenario: ScenarioId) => void;
  scenario: ScenarioDefinition;
}>) {
  return (
    <Pressable
      accessibilityLabel={`${scenario.title}. ${scenario.summary}`}
      accessibilityRole="button"
      onPress={() => onOpen(scenario.id)}
      style={styles.catalogCard}
      testID={`open-${scenario.id}`}
    >
      <Text style={styles.catalogTitle}>{scenario.title}</Text>
      <Text style={styles.catalogSummary}>{scenario.summary}</Text>
      <Text accessibilityElementsHidden style={styles.arrow}>
        ›
      </Text>
    </Pressable>
  );
}

function ScenarioContent({
  area,
  engine,
  onOutcome,
  onPresetChange,
  preset,
  resetToken,
  scenario,
}: Readonly<{
  area: AreaId;
  engine: EnginePolicy;
  onOutcome: (outcome: PublicOutcome) => void;
  onPresetChange: (preset: string) => void;
  preset: string;
  resetToken: number;
  scenario: ScenarioId;
}>) {
  if (area === 'integrations')
    return (
      <IntegrationScenario
        onOutcome={onOutcome}
        resetToken={resetToken}
        scenario={scenario}
      />
    );
  if (scenario === 'free-form')
    return (
      <FreeFormScenario
        engine={area === 'examples' ? 'auto' : engine}
        onOutcome={onOutcome}
        resetToken={resetToken}
      />
    );
  if (scenario === 'multi-selection')
    return (
      <FreeFormScenario
        engine={area === 'examples' ? 'auto' : engine}
        onOutcome={onOutcome}
        resetToken={resetToken}
        selected
      />
    );
  if (scenario === 'section-list')
    return (
      <SectionScenario
        engine={area === 'examples' ? 'auto' : engine}
        onOutcome={onOutcome}
        resetToken={resetToken}
        teaching
      />
    );
  if (scenario === 'cross-panel-drop')
    return (
      <DropScenario
        engine={area === 'examples' ? 'auto' : engine}
        onOutcome={onOutcome}
        resetToken={resetToken}
      />
    );
  if (scenario === 'drop-zones')
    return (
      <DropScenario
        engine={engine}
        onOutcome={onOutcome}
        resetToken={resetToken}
      />
    );
  if (scenario === 'cancellation')
    return (
      <CancellationScenario
        engine={engine}
        onOutcome={onOutcome}
        preset={preset}
        resetToken={resetToken}
      />
    );
  if (scenario === 'accessibility')
    return (
      <AccessibilityScenario
        engine={engine}
        onOutcome={onOutcome}
        resetToken={resetToken}
      />
    );
  if (scenario === 'sections-24x25')
    return (
      <SectionScenario
        engine={engine}
        onOutcome={onOutcome}
        resetToken={resetToken}
      />
    );
  if (scenario === 'selection')
    return (
      <SectionScenario
        engine={engine}
        onOutcome={onOutcome}
        onPresetChange={onPresetChange}
        preset={preset}
        resetToken={resetToken}
        selectionLab
      />
    );
  return (
    <FlatScenario
      engine={area === 'examples' ? 'auto' : engine}
      onOutcome={onOutcome}
      onPresetChange={onPresetChange}
      preset={preset}
      resetToken={resetToken}
      scenario={scenario}
    />
  );
}

export default function App() {
  const [area, setArea] = useState<AreaId>('examples');
  const [scenario, setScenario] = useState<ScenarioId | null>(null);
  const [engine, setEngine] = useState<EnginePolicy>('auto');
  const [preset, setPreset] = useState('default');
  const [resetToken, setResetToken] = useState(0);
  const [outcome, setOutcome] = useState<PublicOutcome>(EMPTY_OUTCOME);
  const applyLink = useCallback((url: string | null | undefined) => {
    if (url == null) return;
    const parsed = parseExampleLink(url);
    if (parsed == null) return;
    setArea(parsed.area);
    setScenario(parsed.scenario);
    setPreset(parsed.preset);
    setEngine(parsed.engine);
    setOutcome(EMPTY_OUTCOME);
    setResetToken((value) => value + 1);
  }, []);
  useEffect(() => {
    Linking.getInitialURL().then(applyLink);
    const subscription = Linking.addEventListener('url', ({ url }) =>
      applyLink(url)
    );
    return () => subscription.remove();
  }, [applyLink]);
  const definition = useMemo(
    () =>
      scenario == null
        ? null
        : AREAS.find((candidate) => candidate.id === area)?.scenarios.find(
            (candidate) => candidate.id === scenario
          ),
    [area, scenario]
  );
  const openScenario = (next: ScenarioId) => {
    setScenario(next);
    setPreset(defaultPresetFor(area, next));
    setEngine('auto');
    setOutcome(EMPTY_OUTCOME);
    setResetToken((value) => value + 1);
  };
  const changeArea = (next: AreaId) => {
    setArea(next);
    setScenario(null);
    setEngine('auto');
    setPreset('default');
    setOutcome(EMPTY_OUTCOME);
  };
  const changeEngine = (next: EnginePolicy) => {
    setEngine(next);
    setOutcome(EMPTY_OUTCOME);
    setResetToken((value) => value + 1);
  };
  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={[styles.safe, styles.safeTop]}>
        <StatusBar barStyle="light-content" />
        {scenario == null || definition == null ? (
          <Catalog
            area={area}
            onAreaChange={changeArea}
            onOpen={openScenario}
          />
        ) : (
          <ScenarioFrame
            area={area}
            engine={area === 'lab' ? engine : 'auto'}
            onBack={() => setScenario(null)}
            onEngineChange={area === 'lab' ? changeEngine : undefined}
            onReset={() => {
              setOutcome(EMPTY_OUTCOME);
              setResetToken((value) => value + 1);
            }}
            outcome={outcome}
            preset={preset}
            scenario={scenario}
            title={definition.title}
          >
            <ScenarioContent
              area={area}
              engine={engine}
              key={`${scenario}:${preset}:${area === 'lab' ? engine : 'auto'}`}
              onOutcome={setOutcome}
              onPresetChange={(next) => {
                setPreset(next);
                setOutcome(EMPTY_OUTCOME);
                setResetToken((value) => value + 1);
              }}
              preset={preset}
              resetToken={resetToken}
              scenario={scenario}
            />
          </ScenarioFrame>
        )}
      </View>
    </GestureHandlerRootView>
  );
}
