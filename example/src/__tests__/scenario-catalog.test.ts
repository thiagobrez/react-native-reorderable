import { describe, expect, it } from '@jest/globals';
import {
  AREAS,
  LAB_SCENARIOS,
  createExactRows,
  createSectionPreset,
  createVariableRows,
  parseExampleLink,
  scenarioLink,
} from '../scenario-catalog';

describe('example application scenario catalog', () => {
  it('publishes the settled three-area navigation and teaching surfaces', () => {
    expect(AREAS.map((area) => area.id)).toEqual([
      'examples',
      'lab',
      'integrations',
    ]);
    expect(AREAS[0]?.scenarios.map((scenario) => scenario.id)).toEqual([
      'free-form',
      'virtualized-list',
      'section-list',
      'multi-selection',
      'cross-panel-drop',
    ]);
    expect(AREAS[2]?.scenarios.map((scenario) => scenario.id)).toEqual([
      'flash-list',
      'flash-section-list',
      'legend-list',
      'legend-section-list',
    ]);
  });

  it('publishes every settled Scenario Lab surface as a named scenario', () => {
    expect(LAB_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'free-form',
      'virtualized-list',
      'section-list',
      'multi-selection',
      'cross-panel-drop',
      'controlled-order',
      'exact-10000',
      'variable-1000',
      'sections-24x25',
      'autoscroll-200',
      'selection',
      'drop-zones',
      'cancellation',
      'accessibility',
    ]);
  });

  it('creates deterministic fixed, variable, and section presets', () => {
    expect(createExactRows(10_000)).toHaveLength(10_000);
    expect(createExactRows(10_000)[9_999]).toEqual({
      id: 'exact-9999',
      label: 'Exact row 10,000',
      height: 52,
    });
    expect(
      createVariableRows(1_000)
        .slice(0, 5)
        .map((row) => row.height)
    ).toEqual([44, 68, 92, 56, 80]);
    const sections = createSectionPreset();
    expect(sections).toHaveLength(27);
    expect(
      sections
        .filter((section) => section.data.length === 0)
        .map((section) => section.id)
    ).toEqual(['empty-beginning', 'empty-middle', 'empty-end']);
    expect(
      sections.filter((section) => section.data.length === 25)
    ).toHaveLength(24);
  });

  it('round-trips stable scenario links with only public engine policies', () => {
    const link = scenarioLink('lab', 'selection', 'fallback');
    expect(link).toBe(
      'reorderable://lab/selection?preset=contiguous&engine=fallback'
    );
    expect(parseExampleLink(link)).toEqual({
      area: 'lab',
      scenario: 'selection',
      preset: 'contiguous',
      engine: 'fallback',
    });
    expect(
      parseExampleLink(
        'reorderable://examples/free-form?preset=teaching&engine=fallback'
      )
    ).toEqual({
      area: 'examples',
      scenario: 'free-form',
      preset: 'teaching',
      engine: 'auto',
    });
    expect(
      parseExampleLink('reorderable://lab/nope?preset=default&engine=auto')
    ).toBeNull();
    expect(
      parseExampleLink('reorderable://lab/selection?preset=unknown&engine=auto')
    ).toBeNull();
    expect(parseExampleLink('not a link')).toBeNull();
  });
});
