import type { EnginePolicy } from 'react-native-reorderable';

export type AreaId = 'examples' | 'lab' | 'integrations';

export type ScenarioId =
  | 'free-form'
  | 'virtualized-list'
  | 'section-list'
  | 'multi-selection'
  | 'cross-panel-drop'
  | 'controlled-order'
  | 'exact-10000'
  | 'variable-1000'
  | 'sections-24x25'
  | 'autoscroll-200'
  | 'selection'
  | 'drop-zones'
  | 'cancellation'
  | 'accessibility'
  | 'flash-list'
  | 'flash-section-list'
  | 'legend-list'
  | 'legend-section-list';

export type ScenarioDefinition = Readonly<{
  id: ScenarioId;
  title: string;
  summary: string;
}>;

export const EXAMPLE_SCENARIOS: readonly ScenarioDefinition[] = [
  {
    id: 'free-form',
    title: 'Free-form children',
    summary: 'Compose reorderable children in any mounted layout.',
  },
  {
    id: 'virtualized-list',
    title: 'Virtualized list',
    summary: 'Keep FlatList windowing with controlled order.',
  },
  {
    id: 'section-list',
    title: 'Cross-section list',
    summary: 'Move rows between virtualized sections.',
  },
  {
    id: 'multi-selection',
    title: 'App-owned selection',
    summary: 'Move an application-owned selection atomically.',
  },
  {
    id: 'cross-panel-drop',
    title: 'Cross-panel drop',
    summary: 'Accept or reject a move set in scoped drop zones.',
  },
];

export const LAB_SCENARIOS: readonly ScenarioDefinition[] = [
  {
    id: 'controlled-order',
    title: 'Controlled order',
    summary: 'Accept, delay, or restore the proposed next order.',
  },
  {
    id: 'exact-10000',
    title: '10,000 exact rows',
    summary: 'Fixed geometry and full-list virtualization.',
  },
  {
    id: 'variable-1000',
    title: '1,000 variable rows',
    summary: 'Seeded variable heights with adaptive geometry.',
  },
  {
    id: 'sections-24x25',
    title: '24 × 25 sections',
    summary: 'Section chrome and beginning, middle, and end empties.',
  },
  {
    id: 'autoscroll-200',
    title: '200-row auto-scroll',
    summary: 'Drag across several virtualized viewports.',
  },
  {
    id: 'selection',
    title: 'Selection',
    summary: 'Contiguous, noncontiguous, and cross-section move sets.',
  },
  {
    id: 'drop-zones',
    title: 'Drop zones',
    summary: 'Accepting, rejecting, and unmounting destinations.',
  },
  {
    id: 'cancellation',
    title: 'Lifecycle cancellation',
    summary: 'Cancel by disabling or unmounting a live container.',
  },
  {
    id: 'accessibility',
    title: 'Accessible interactions',
    summary: 'Real semantic reorder and accessible drop actions.',
  },
];

export const INTEGRATION_SCENARIOS: readonly ScenarioDefinition[] = [
  {
    id: 'flash-list',
    title: 'FlashList',
    summary: 'Focused optional-provider list example.',
  },
  {
    id: 'flash-section-list',
    title: 'FlashList sections',
    summary: 'Focused optional-provider section-list example.',
  },
  {
    id: 'legend-list',
    title: 'Legend List',
    summary: 'Focused optional-provider list example.',
  },
  {
    id: 'legend-section-list',
    title: 'Legend List sections',
    summary: 'Focused optional-provider section-list example.',
  },
];

export const AREAS = [
  { id: 'examples', title: 'Examples', scenarios: EXAMPLE_SCENARIOS },
  { id: 'lab', title: 'Scenario Lab', scenarios: LAB_SCENARIOS },
  {
    id: 'integrations',
    title: 'Integrations',
    scenarios: INTEGRATION_SCENARIOS,
  },
] as const;

export function presetsFor(
  area: AreaId,
  scenario: ScenarioId
): readonly string[] {
  if (area === 'examples') return ['teaching'];
  if (area === 'integrations') return ['focused'];
  if (scenario === 'controlled-order') return ['accept', 'delay', 'restore'];
  if (scenario === 'selection')
    return ['contiguous', 'noncontiguous', 'cross-section'];
  return ['default'];
}

export function defaultPresetFor(area: AreaId, scenario: ScenarioId): string {
  return presetsFor(area, scenario)[0]!;
}

export type ScenarioRow = Readonly<{
  id: string;
  label: string;
  height: number;
}>;
export type ScenarioSection = Readonly<{
  id: string;
  title: string;
  data: readonly ScenarioRow[];
}>;

export function createExactRows(
  count: number,
  prefix = 'exact'
): ScenarioRow[] {
  const labelPrefix = `${prefix[0]?.toUpperCase() ?? ''}${prefix.slice(1)}`;
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    label: `${labelPrefix} row ${String(index + 1).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`,
    height: 52,
  }));
}

export function createVariableRows(
  count: number,
  prefix = 'variable'
): ScenarioRow[] {
  const heights = [44, 68, 92, 56, 80] as const;
  const labelPrefix = `${prefix[0]?.toUpperCase() ?? ''}${prefix.slice(1)}`;
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    label: `${labelPrefix} row ${index + 1}`,
    height: heights[index % heights.length]!,
  }));
}

export function createSectionPreset(): ScenarioSection[] {
  const populated = Array.from({ length: 24 }, (_section, sectionIndex) => ({
    id: `section-${sectionIndex + 1}`,
    title: `Section ${sectionIndex + 1}`,
    data: Array.from({ length: 25 }, (_row, itemIndex) => ({
      id: `section-${sectionIndex + 1}-row-${itemIndex + 1}`,
      label: `Section ${sectionIndex + 1}, row ${itemIndex + 1}`,
      height: 52,
    })),
  }));
  return [
    { id: 'empty-beginning', title: 'Empty beginning', data: [] },
    ...populated.slice(0, 12),
    { id: 'empty-middle', title: 'Empty middle', data: [] },
    ...populated.slice(12),
    { id: 'empty-end', title: 'Empty end', data: [] },
  ];
}

export function scenarioLink(
  area: AreaId,
  scenario: ScenarioId,
  engine: EnginePolicy = 'auto',
  preset = defaultPresetFor(area, scenario)
): string {
  return `reorderable://${area}/${scenario}?preset=${encodeURIComponent(preset)}&engine=${engine}`;
}

export function parseExampleLink(url: string): Readonly<{
  area: AreaId;
  scenario: ScenarioId;
  preset: string;
  engine: EnginePolicy;
}> | null {
  const match =
    /^reorderable:\/\/(examples|lab|integrations)\/([^?]+)\?preset=([^&]+)&engine=(auto|fallback)$/.exec(
      url
    );
  if (match == null) return null;
  const area = match[1] as AreaId;
  const scenario = match[2] as ScenarioId;
  const definition = AREAS.find((candidate) => candidate.id === area);
  if (!definition?.scenarios.some((candidate) => candidate.id === scenario))
    return null;
  try {
    const preset = decodeURIComponent(match[3]!);
    if (!presetsFor(area, scenario).includes(preset)) return null;
    return {
      area,
      scenario,
      preset,
      engine: area === 'lab' && match[4] === 'fallback' ? 'fallback' : 'auto',
    };
  } catch {
    return null;
  }
}
