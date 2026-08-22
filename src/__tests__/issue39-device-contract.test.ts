import { describe, expect, it, jest } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { reconcileReorder } from '../semantic';

type ContractScenario = Readonly<{
  id: string;
  deepLink: string;
  action: Readonly<{
    destinationPlacement?: string;
    holdDurationMs?: number;
    kind: string;
  }>;
  covers: readonly string[];
  platforms: readonly string[];
  selectors: readonly Readonly<{ label: string; testID?: string }>[];
  initial?: Readonly<{ labels: readonly string[] }>;
  expected?: Readonly<{ labels?: readonly string[] }>;
}>;

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('issue 39 portable device contract', () => {
  it('defines one public black-box scenario catalog for every contractual behavior', () => {
    const scenarios = JSON.parse(
      read('e2e/contracts/scenarios.json')
    ) as readonly ContractScenario[];
    const coverage = new Set(scenarios.flatMap((scenario) => scenario.covers));

    expect([...coverage].sort()).toEqual(
      [
        'accessibility-drop',
        'accessibility-reorder',
        'android-app-state',
        'android-back',
        'android-blur',
        'enabled-false',
        'free-form',
        'gesture-system-interruption',
        'invalid-outside-release',
        'ios-background',
        'ios-inactive',
        'list',
        'multi-selection',
        'scoped-drag-drop',
        'section-list',
        'unmount',
      ].sort()
    );
    expect(
      scenarios.every(({ deepLink }) =>
        deepLink.startsWith('reorderable://lab/')
      )
    ).toBe(true);
    expect(
      scenarios.every(({ selectors }) =>
        selectors.every(({ label }) => label.length > 0)
      )
    ).toBe(true);
  });

  it('uses a single uninterrupted selector-targeted drag and public accessibility actions', () => {
    const runner = read('e2e/contracts/portable-contract.e2e.cjs');
    const pointerDrivers = JSON.parse(
      read('e2e/contracts/pointer-drivers.json')
    ) as {
      default: {
        destination: { normalizedX: number; normalizedY: number };
        driver: string;
      };
      overrides: Record<
        string,
        Record<
          string,
          {
            destinationSelector: { label: string; relation: string };
            driver: string;
            semanticTargetLabel: string;
          }
        >
      >;
      routes: Record<string, Record<string, string>>;
    };
    const scenarios = JSON.parse(
      read('e2e/contracts/scenarios.json')
    ) as readonly ContractScenario[];
    const pointerScenarios = scenarios.filter(
      ({ action }) => action.kind === 'drag'
    );

    expect(runner).toContain('const publicElement = visible(label)');
    expect(runner).not.toContain('by.label(label).and(by.id');
    expect(runner).toContain('await disambiguated.getAttributes()');

    expect(runner).toContain("require('detox/internals')");
    expect(runner).toContain('detoxRuntimeConfig.configurationName');
    expect(runner).not.toContain('process.env.DETOX_CONFIGURATION');
    expect(runner).toContain('.longPressAndDrag(');
    expect(runner).toContain("require('./pointer-drivers.json')");
    expect(pointerDrivers.default).toMatchObject({
      destination: { normalizedX: 0.5, normalizedY: 0.25 },
      driver: 'detox',
    });
    expect(pointerDrivers.routes['ios26.auto-fallback']).toMatchObject({
      'free-form-reorder': 'detox',
      'multi-selection-reorder': 'detox',
      'scoped-drop': 'agent-device',
      'section-list-reorder': 'agent-device',
      'virtualized-list-reorder': 'agent-device',
    });
    expect(pointerDrivers.overrides['ios26.auto-fallback']).toMatchObject({
      'free-form-reorder': { driver: 'detox' },
      'multi-selection-reorder': { driver: 'detox' },
    });
    expect(pointerDrivers.routes['android.fallback']).toEqual({
      'free-form-reorder': 'detox',
      'virtualized-list-reorder': 'detox',
      'section-list-reorder': 'detox',
      'multi-selection-reorder': 'detox',
      'scoped-drop': 'detox',
    });
    expect(pointerDrivers.overrides['android.fallback']).toMatchObject({
      'free-form-reorder': { driver: 'detox' },
      'virtualized-list-reorder': { driver: 'detox' },
      'section-list-reorder': { driver: 'detox' },
      'multi-selection-reorder': { driver: 'detox' },
      'scoped-drop': { driver: 'detox' },
    });
    expect(runner).toContain("scenario.action.kind === 'drag'");
    expect(runner).toContain("destinationPlacement !== 'beforeTarget'");
    expect(pointerScenarios).not.toHaveLength(0);
    expect(
      pointerScenarios.every(
        ({ action }) => action.destinationPlacement === 'beforeTarget'
      )
    ).toBe(true);
    expect(
      Object.values(pointerDrivers.routes).flatMap((routes) =>
        Object.keys(routes)
      )
    ).toHaveLength(20);
    for (const routes of Object.values(pointerDrivers.routes)) {
      expect(Object.keys(routes).sort()).toEqual(
        pointerScenarios.map(({ id }) => id).sort()
      );
    }
    expect(runner).not.toContain('Number.NaN');
    expect(runner).toContain('.performAccessibilityAction(');
    expect(runner).toContain('accessibilityActionForPlatform');
    expect(runner).toContain("'reorder-move-later': 'Move later'");
    expect(runner).toContain(
      "'drag-drop-drop-selected': 'Drop selected items here'"
    );
    expect(runner).toContain('by.label(');
    expect(runner).not.toMatch(/reorderable-(?:list|section-list)-wrapper-/);
    expect(runner).not.toMatch(/debugPerform|trigger-app-event|acceptanceMove/);
    expect(runner).not.toMatch(/\.skip\(|\.todo\(|retryTimes|--retries/);
  });

  it('plans native SwiftUI insertion by semantic target when the driver is center-only', () => {
    const scenarios = JSON.parse(
      read('e2e/contracts/scenarios.json')
    ) as readonly ContractScenario[];
    const pointerDrivers = JSON.parse(
      read('e2e/contracts/pointer-drivers.json')
    ) as {
      overrides: Record<
        string,
        Record<
          string,
          {
            destinationSelector: { relation: string };
            driver: string;
            semanticTargetLabel: string;
          }
        >
      >;
    };
    const scenario = scenarios.find(({ id }) => id === 'free-form-reorder');
    const plan =
      pointerDrivers.overrides['ios27.native']?.['free-form-reorder'];
    const fallbackPlan =
      pointerDrivers.overrides['ios27.fallback']?.['free-form-reorder'];
    const listPlan =
      pointerDrivers.overrides['ios27.native']?.['virtualized-list-reorder'];
    const sectionPlan =
      pointerDrivers.overrides['ios27.native']?.['section-list-reorder'];

    expect(scenario?.action).toMatchObject({
      destinationPlacement: 'beforeTarget',
    });
    expect(scenario?.selectors.map(({ label }) => label)).toContain(
      'Card row 4'
    );
    expect(plan).toEqual({
      driver: 'agent-device',
      semanticTargetLabel: 'Card row 4',
      canonicalOrder: [
        {
          sectionId: null,
          itemIds: ['card-0', 'card-1', 'card-2', 'card-3', 'card-4', 'card-5'],
        },
      ],
      destinationId: 'card-3',
      labelsById: { 'card-2': 'Card row 3' },
      destinationSelector: {
        relation: 'predecessorCenter',
      },
    });
    expect(fallbackPlan).toEqual({
      driver: 'agent-device',
      semanticTargetLabel: 'Card row 4',
      destinationSelector: {
        relation: 'namedTargetCenterAfterSourceLift',
        label: 'Card row 4',
      },
    });
    const replay = read(
      'e2e/agent-device/ios/free-form-before-target-native.ad'
    );
    expect(replay).toContain(
      'gesture drag "label=\\"Card row 1\\"" "label=\\"Card row 3\\"" 650 1200 8000'
    );
    expect(listPlan).toEqual({
      driver: 'agent-device',
      semanticTargetLabel: 'List row 4',
      destinationSelector: {
        relation: 'namedTargetCenterAfterSourceLift',
        label: 'List row 4',
      },
    });
    expect(sectionPlan).toEqual({
      driver: 'agent-device',
      semanticTargetLabel: 'Section 1, row 4',
      destinationSelector: {
        relation: 'namedTargetCenterAfterSourceLift',
        label: 'Section 1, row 4',
      },
    });
    expect(replay).toContain('\\"beforeId\\":\\"card-3\\"');
  });

  it('derives the surviving predecessor for every selection shape', () => {
    const planning = jest.requireActual<{
      predecessorBeforeTarget: (
        order: readonly Readonly<{
          sectionId: string | null;
          itemIds: readonly string[];
        }>[],
        sourceIds: readonly string[],
        destination: Readonly<{ sectionId: string | null; beforeId: string }>
      ) => string | null;
    }>(resolve(root, 'e2e/contracts/pointer-planning.cjs'));
    const predecessor = planning.predecessorBeforeTarget;

    expect(
      predecessor(
        [{ sectionId: null, itemIds: ['a', 'b', 'c', 'd', 'e'] }],
        ['b', 'c'],
        { sectionId: null, beforeId: 'e' }
      )
    ).toBe('d');
    expect(
      predecessor(
        [{ sectionId: null, itemIds: ['a', 'b', 'c', 'd', 'e', 'f'] }],
        ['b', 'd'],
        { sectionId: null, beforeId: 'f' }
      )
    ).toBe('e');
    expect(
      predecessor(
        [
          { sectionId: 'one', itemIds: ['a1', 'a2'] },
          { sectionId: 'two', itemIds: ['b1', 'b2'] },
          { sectionId: 'three', itemIds: ['c1', 'c2'] },
        ],
        ['a2', 'b1'],
        { sectionId: 'three', beforeId: 'c2' }
      )
    ).toBe('c1');
  });

  it('records observed accessibility outcomes and rejects mismatches', () => {
    const observation = jest.requireActual<{
      agentDeviceReplayScript: (options: {
        acceptDeepLinkPrompt: boolean;
        baselinePath: string;
        deepLink: string;
        destinationSelector: string;
        expectedLabels: string[];
        gestureMarkerPath: string;
        initialLabels: string[];
        platform: string;
        recordingPath: string;
        sourceSelector: string;
        terminalPath: string;
        timing: {
          destinationHoldMs: number;
          moveBudgetMs: number;
          sourceHoldMs: number;
        };
      }) => string;
      observedLabelFromDetoxAttributes: (
        attributes: unknown,
        expectedLabel: string
      ) => string;
      observedLabelsFromSnapshot: (
        snapshot: unknown,
        expectedLabels: readonly string[],
        bundleId: string
      ) => { labels: string[] };
    }>(resolve(root, 'e2e/contracts/outcome-observation.cjs'));
    const snapshot = {
      success: true,
      data: {
        nodes: [
          {
            bundleId: 'reorderable.example',
            label:
              'Public scenario outcome. Current selection: none. Callback count: 1',
            visibleToUser: true,
          },
        ],
      },
    };

    expect(
      observation.observedLabelsFromSnapshot(
        snapshot,
        ['Callback count: 1'],
        'reorderable.example'
      )
    ).toEqual({ labels: ['Callback count: 1'] });
    expect(() =>
      observation.observedLabelsFromSnapshot(
        snapshot,
        ['Callback count: 0'],
        'reorderable.example'
      )
    ).toThrow(/expected exactly one "Callback count: 0", found 0/);
    expect(() =>
      observation.observedLabelFromDetoxAttributes(
        { label: 'Callback count: 0' },
        'Callback count: 1'
      )
    ).toThrow(/observed "Callback count: 0" instead of "Callback count: 1"/);
    expect(
      observation.agentDeviceReplayScript({
        acceptDeepLinkPrompt: false,
        baselinePath: '/tmp/baseline.png',
        deepLink: 'reorderable://lab/free-form?engine=fallback',
        destinationSelector: 'label="Card row 3"',
        expectedLabels: ['Callback count: 1'],
        gestureMarkerPath: '/tmp/gesture-start.png',
        initialLabels: ['Callback count: 0'],
        platform: 'android',
        recordingPath: '/tmp/pointer.mp4',
        sourceSelector: 'label="Card row 1"',
        terminalPath: '/tmp/terminal.png',
        timing: {
          destinationHoldMs: 8000,
          moveBudgetMs: 1200,
          sourceHoldMs: 650,
        },
      })
    ).toContain(
      'gesture drag "label=\\"Card row 1\\"" "label=\\"Card row 3\\"" 650 1200 8000'
    );
    expect(
      observation.agentDeviceReplayScript({
        acceptDeepLinkPrompt: false,
        baselinePath: '/tmp/baseline.png',
        deepLink: 'reorderable://lab/free-form?engine=fallback',
        destinationSelector: 'label="Card row 3"',
        expectedLabels: ['Callback count: 1'],
        gestureMarkerPath: '/tmp/gesture-start.png',
        initialLabels: ['Callback count: 0'],
        platform: 'android',
        recordingPath: '/tmp/pointer.mp4',
        sourceSelector: 'label="Card row 1"',
        terminalPath: '/tmp/terminal.png',
        timing: {
          destinationHoldMs: 8000,
          moveBudgetMs: 1200,
          sourceHoldMs: 650,
        },
      })
    ).toContain(
      'open "${APP_TARGET}" --relaunch\nwait "Scenario Lab" 15000\nopen "${DEEP_LINK}"\nwait "Callback count: 0" 15000\nscreenshot "/tmp/baseline.png"\nrecord start "/tmp/pointer.mp4" --scope device'
    );
    const iosReplay = observation.agentDeviceReplayScript({
      acceptDeepLinkPrompt: true,
      baselinePath: '/tmp/baseline.png',
      deepLink: 'reorderable://lab/free-form?engine=fallback',
      destinationSelector: 'label="Card row 3"',
      expectedLabels: ['Callback count: 1'],
      gestureMarkerPath: '/tmp/gesture-start.png',
      initialLabels: ['Callback count: 0'],
      platform: 'ios',
      recordingPath: '/tmp/pointer.mp4',
      sourceSelector: 'label="Card row 1"',
      terminalPath: '/tmp/terminal.png',
      timing: {
        destinationHoldMs: 8000,
        moveBudgetMs: 1200,
        sourceHoldMs: 650,
      },
    });
    expect(iosReplay).toContain(
      'open "${DEEP_LINK}"\nalert accept\nopen "${DEEP_LINK}"\nwait "Callback count: 0" 15000'
    );
    expect(
      observation.agentDeviceReplayScript({
        acceptDeepLinkPrompt: false,
        baselinePath: '/tmp/baseline.png',
        deepLink: 'reorderable://lab/free-form?engine=fallback',
        destinationSelector: 'label="Card row 3"',
        expectedLabels: ['Callback count: 1'],
        gestureMarkerPath: '/tmp/gesture-start.png',
        initialLabels: ['Callback count: 0'],
        platform: 'ios',
        recordingPath: '/tmp/pointer.mp4',
        sourceSelector: 'label="Card row 1"',
        terminalPath: '/tmp/terminal.png',
        timing: {
          destinationHoldMs: 8000,
          moveBudgetMs: 1200,
          sourceHoldMs: 650,
        },
      })
    ).not.toContain('alert accept');
  });

  it('fails parity when independently observed engine outcomes differ', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'issue39-parity-'));
    try {
      const scenarios = JSON.parse(
        read('e2e/contracts/scenarios.json')
      ) as readonly ContractScenario[];
      for (const configuration of [
        'android.fallback',
        'ios26.auto-fallback',
        'ios27.fallback',
        'ios27.native',
      ]) {
        const platform = configuration.startsWith('android')
          ? 'android'
          : 'ios';
        const outcomes = Object.fromEntries(
          scenarios
            .filter(({ platforms }) => platforms.includes(platform))
            .map(({ id }) => [
              id,
              {
                labels: [
                  configuration === 'ios27.native' && id === 'free-form-reorder'
                    ? 'Callback count: 0'
                    : 'Callback count: 1',
                ],
              },
            ])
        );
        writeFileSync(
          resolve(directory, `${configuration}.json`),
          JSON.stringify({
            configuration,
            outcomes,
          })
        );
      }
      expect(() =>
        execFileSync(
          process.execPath,
          [
            resolve(root, 'scripts/compare-device-contract-outcomes.mjs'),
            directory,
          ],
          { encoding: 'utf8' }
        )
      ).toThrow(/free-form-reorder differs between/);

      const nativePath = resolve(directory, 'ios27.native.json');
      const nativeReport = JSON.parse(readFileSync(nativePath, 'utf8')) as {
        outcomes: Record<string, unknown>;
      };
      delete nativeReport.outcomes.unmount;
      writeFileSync(nativePath, JSON.stringify(nativeReport));
      expect(() =>
        execFileSync(
          process.execPath,
          [
            resolve(root, 'scripts/compare-device-contract-outcomes.mjs'),
            directory,
          ],
          { encoding: 'utf8' }
        )
      ).toThrow(/ios27\.native: expected outcomes for/);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it('verifies visible and legitimately occluded continuous feedback', () => {
    const verifier = resolve(root, 'scripts/verify-device-feedback.mjs');
    const runFixture = (name: string) =>
      execFileSync(
        process.execPath,
        [
          verifier,
          '--case',
          resolve(root, `e2e/contracts/fixtures/${name}.json`),
        ],
        { encoding: 'utf8' }
      );

    expect(runFixture('feedback-valid')).toContain(
      'Verified continuous feedback for 2 runs'
    );
    expect(runFixture('feedback-occluded-valid')).toContain(
      'Verified continuous feedback for 1 runs'
    );
    expect(() => runFixture('feedback-missing')).toThrow(
      /expected at least 3 hold samples/
    );
    expect(() => runFixture('feedback-ambiguous')).toThrow(
      /expected exactly one public label "Card row 1", found 2/
    );
    expect(() => runFixture('feedback-baseline-ambiguous')).toThrow(
      /baseline\.png: expected exactly one public label "Card row 6", found 2/
    );
    expect(() => runFixture('feedback-source-outside')).toThrow(
      /floating Card row 2 is not between Card row 4 and Card row 6/
    );
    expect(() => runFixture('feedback-insufficient-change')).toThrow(
      /occluded insertion band visual change 0\.01 is below 0\.02/
    );
    const feedbackSpecs = JSON.parse(
      read('e2e/contracts/feedback-specs.json')
    ) as {
      scenarios: Record<
        string,
        {
          targetLabel: string;
          visualTargetLabel?: string;
          visualTargetLabelsByConfiguration?: Record<string, string>;
        }
      >;
    };
    expect(feedbackSpecs.scenarios['scoped-drop']).toMatchObject({
      targetLabel: 'Accepting drop zone',
      visualTargetLabel: 'Acceptin',
      visualTargetLabelsByConfiguration: {
        'ios27.fallback': 'Drop selected items here',
        'ios26.auto-fallback': 'Drop selected items here',
        'android.fallback': 'Drop selected items here',
      },
    });
  });

  it('requires exactly one feedback run for every canonical configuration/scenario pair', () => {
    const verifierUrl = JSON.stringify(
      `file://${resolve(root, 'scripts/verify-device-feedback.mjs')}`
    );
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `const { assertFeedbackUniverse } = await import(${verifierUrl});
const configurations = ['android.fallback', 'ios26.auto-fallback', 'ios27.fallback', 'ios27.native'];
const scenarios = ['free-form-reorder', 'multi-selection-reorder', 'scoped-drop', 'section-list-reorder', 'virtualized-list-reorder'];
const runs = configurations.flatMap(configuration => scenarios.map(scenario => ({ configuration, scenario })));
const failure = candidate => { try { assertFeedbackUniverse(candidate); return null; } catch (error) { return error.message; } };
console.log(JSON.stringify({
  complete: failure(runs),
  missing: failure(runs.slice(1)),
  duplicate: failure([...runs, runs[0]]),
}));`,
        ],
        { encoding: 'utf8' }
      )
    );

    expect(result).toEqual({
      complete: null,
      missing:
        'feedback report must contain exactly the canonical 20 runs; received 19',
      duplicate:
        'feedback report contains duplicate configuration/scenario runs',
    });
  });

  it('limits moving-preview OCR tolerance to row/rom without weakening identity', () => {
    const verifierUrl = JSON.stringify(
      `file://${resolve(root, 'scripts/verify-device-feedback.mjs')}`
    );
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `const { matchingLabels } = await import(${verifierUrl});
const count = (texts, expected) => matchingLabels(texts.map((text) => ({ text })), expected).length;
console.log(JSON.stringify({
  observedTypo: count(['Card rom 2'], 'Card row 2'),
  wrongNumericIdentity: count(['Card rom 3'], 'Card row 2'),
  duplicateCandidates: count(['Card rom 2', 'Card rom 2'], 'Card row 2'),
  missingSource: count([], 'Card row 2'),
  broaderEdit: count(['Cord row 2'], 'Card row 2'),
}));`,
        ],
        { encoding: 'utf8' }
      )
    );

    expect(result).toEqual({
      observedTypo: 1,
      wrongNumericIdentity: 0,
      duplicateCandidates: 2,
      missingSource: 0,
      broaderEdit: 0,
    });
  });

  it('samples pointer feedback only after a long destination hold has settled', () => {
    const scenarios = JSON.parse(
      read('e2e/contracts/scenarios.json')
    ) as readonly ContractScenario[];
    const feedbackSpecs = JSON.parse(
      read('e2e/contracts/feedback-specs.json')
    ) as { scenarios: Record<string, unknown> };
    const pointerScenarios = scenarios.filter(({ id }) =>
      Object.hasOwn(feedbackSpecs.scenarios, id)
    );
    const timing = JSON.parse(read('e2e/contracts/pointer-timing.json')) as {
      destinationHoldMs: number;
      moveBudgetMs: number;
      sampleCount: number;
      sampleIntervalMs: number;
      settleMarginMs: number;
      sourceHoldMs: number;
    };
    const detoxRunner = read('e2e/contracts/portable-contract.e2e.cjs');
    const agentDeviceRunner = read('scripts/run-agent-device-pointer.mjs');

    expect(
      pointerScenarios.every(
        ({ action }) => action.holdDurationMs === timing.destinationHoldMs
      )
    ).toBe(true);
    const firstSampleMs =
      timing.sourceHoldMs + timing.moveBudgetMs + timing.settleMarginMs;
    const finalSampleMs =
      firstSampleMs + (timing.sampleCount - 1) * timing.sampleIntervalMs;
    const releaseMs =
      timing.sourceHoldMs + timing.moveBudgetMs + timing.destinationHoldMs;
    expect(firstSampleMs).toBeGreaterThan(
      timing.sourceHoldMs + timing.moveBudgetMs
    );
    expect(finalSampleMs).toBeLessThan(releaseMs);
    expect(releaseMs - finalSampleMs).toBeGreaterThanOrEqual(3000);
    expect(detoxRunner).toContain("require('./pointer-timing.json')");
    expect(detoxRunner).toContain('feedbackFirstSampleMs');
    expect(agentDeviceRunner).toContain(
      "'../e2e/contracts/pointer-timing.json'"
    );
    expect(agentDeviceRunner).toContain('feedbackFirstSampleMs');
    expect(agentDeviceRunner).toContain("'replay',");
    expect(agentDeviceRunner).toContain('observedLabelsFromSnapshot');
    expect(agentDeviceRunner).not.toContain(
      '[scenarioId]: {\n          labels: scenario.expected'
    );
    expect(agentDeviceRunner).toContain('gestureMarkerPath');
    expect(agentDeviceRunner).toContain('feedbackFirstSampleMs');
    expect(agentDeviceRunner).toContain("'screencap'");
    expect(agentDeviceRunner).toContain("'deep-link-confirmed'");
    expect(agentDeviceRunner).toContain('acceptDeepLinkPrompt');
    expect(agentDeviceRunner).toContain('Date.now() + 180000');
    expect(agentDeviceRunner).toMatch(/'--timeout',\s*'180000'/);
    expect(
      agentDeviceRunner.indexOf('const replayResult = await replayExit')
    ).toBeLessThan(agentDeviceRunner.indexOf("await runSessionCommand('wait'"));
    expect(agentDeviceRunner).toContain('and terminal observation failed');
    expect(agentDeviceRunner).not.toMatch(
      /if \(replayResult !== 0\)\s*throw new Error\(`Agent Device replay exited/
    );
    expect(agentDeviceRunner).toContain(
      "resolve('node_modules/.bin/agent-device')"
    );
    expect(agentDeviceRunner).not.toMatch(
      /execFileAsync\(agentDevice, \['daemon', 'stop'\]/
    );
  });

  it('derives focused action-smoke discovery and outcomes from exact public labels', () => {
    const scenarios = JSON.parse(
      read('e2e/contracts/scenarios.json')
    ) as readonly ContractScenario[];
    const freeForm = scenarios.find(({ id }) => id === 'free-form-reorder');

    expect(freeForm?.initial?.labels).toEqual([
      'Current order: card-0, card-1, card-2, card-3, card-4, card-5',
      'Current selection: none',
      'Last committed event: None',
      'Callback count: 0',
    ]);
    expect(freeForm?.expected?.labels).toEqual([
      'Current order: card-1, card-2, card-0, card-3, card-4, card-5',
      'Current selection: none',
      'Last committed event: {"sourceIds":["card-0"],"destination":{"sectionId":null,"beforeId":"card-3"}}',
      'Callback count: 1',
    ]);
    expect(read('example/src/components.tsx')).toContain(
      'Current order: ${outcome.order}. Current selection: ${outcome.selection}. Last committed event: ${outcome.event}. Callback count: ${outcome.callbackCount}'
    );
    const semanticEvent = reconcileReorder(
      [
        {
          sectionId: null,
          itemIds: ['card-0', 'card-1', 'card-2', 'card-3', 'card-4', 'card-5'],
        },
      ],
      ['card-0'],
      { sectionId: null, beforeId: 'card-3' }
    );
    expect(
      `Current order: ${semanticEvent?.nextOrder[0]?.itemIds.join(', ')}`
    ).toBe(freeForm?.expected?.labels?.[0]);
  });

  it('pins the exact four engine/runtime configurations and retains recordings', () => {
    const config = read('.detoxrc.cjs');
    const workflow = read('.github/workflows/exact-package-candidate.yml');
    const isolatedRunner = read('scripts/run-device-contract-isolated.mjs');
    const jobRunner = read('scripts/run-device-contract-job.mjs');

    for (const configuration of [
      'ios27.native',
      'ios27.fallback',
      'ios26.auto-fallback',
      'android.fallback',
    ]) {
      expect(config).toContain(`'${configuration}'`);
      expect(workflow).toContain(configuration);
    }
    expect(read('package.json')).toContain('"detox": "20.51.4"');
    expect(read('e2e/jest.config.cjs')).toContain(
      "globalSetup: 'detox/runners/jest/globalSetup'"
    );
    expect(read('e2e/jest.config.cjs')).toContain(
      "globalTeardown: 'detox/runners/jest/globalTeardown'"
    );
    expect(config).toContain("launchApp: 'auto'");
    expect(isolatedRunner).toContain("'--record-videos'");
    expect(isolatedRunner).toContain("'--take-screenshots'");
    expect(workflow).toContain('if: always()');
    expect(workflow).not.toContain('--retries');
    expect(jobRunner).toContain('index <= 2');
    expect(jobRunner).toContain('ISSUE39_MATRIX_ATTEMPT: attempt');
    expect(jobRunner).toContain('publishSuccessfulAttempt(attempt)');
    expect(jobRunner).toContain('finalStatus === 75');
    expect(jobRunner).toContain("? 'infrastructure'");
    expect(isolatedRunner).toContain('reachedContractAssertion');
    expect(isolatedRunner).toContain("failureKind === 'infrastructure'");
    expect(isolatedRunner).toContain('infrastructureFailure ? 75 : 1');
    expect(workflow).toContain('timeout-minutes: 150');
    expect(workflow).toContain('api-level: 36');
    expect(workflow).toContain('profile: pixel_2');
    expect(workflow).not.toContain('profile: pixel_7_pro');
  });

  it('keeps the physical iOS 27 VoiceOver record tied to the named public contract', () => {
    const protocol = read('artifacts/issue-39/PHYSICAL-IOS27-VOICEOVER.md');
    const record = read(
      'artifacts/issue-39/physical-ios27-voiceover/2026-08-14T180600Z-00008150/RECORD.md'
    );

    expect(protocol).toContain('Status: **NOT RUN');
    expect(protocol).not.toContain('Status: **PASS');
    expect(protocol).toContain(
      'reorderable://lab/accessibility?preset=default&engine=auto'
    );
    for (const publicContract of [
      'blue accessible card, selected',
      'Move later',
      'Moved 2 items to position 2 of 3.',
      'Current order: yellow, blue, green',
      '"sourceIds":["blue","green"]',
      'Accessible accepting drop zone',
      'Drop selected items here',
      'Dropped 2 items.',
      '"destinationId":"accessible-zone"',
      'Callback count: 1',
    ]) {
      expect(protocol).toContain(publicContract);
    }
    expect(protocol).toContain('same logical element');
    expect(protocol).toContain('Agent Device 0.20.6');
    expect(protocol).toContain('It can drive VoiceOver focus');
    expect(protocol).toContain('simulator or forced fallback');
    expect(record).toContain('Status: **PASS**');
    expect(record).toContain(
      '8f0a4f59e0a5781ba059fcba3798197db6bbc4bc5deeea896609b6a8fb1ed073'
    );
    expect(record).toContain('Agent Device version: repository-pinned 0.20.6');
    expect(record).toContain('Moved 2 items to position 2 of 3.');
    expect(record).toContain('Dropped 2 items.');
    expect(record).toContain('Same logical blue element retained focus: yes');
    expect(record).toContain('Same accepting zone retained focus: yes');
  });

  it('isolates every device row and waits for drag dispatch before system interruption', () => {
    const runner = read('e2e/contracts/portable-contract.e2e.cjs');
    const isolatedRunner = read('scripts/run-device-contract-isolated.mjs');
    const iosRunnerPreflight = read(
      'scripts/prepare-agent-device-ios-runner.mjs'
    );
    const jobRunner = read('scripts/run-device-contract-job.mjs');
    const workflow = read('.github/workflows/exact-package-candidate.yml');

    expect(runner.indexOf('onActionStarted?.();')).toBeLessThan(
      runner.indexOf('await actionStarted;')
    );
    expect(runner).toContain('runIndependentIosSystemAction');
    expect(runner).toContain('prepareIndependentIosSystemSession');
    expect(runner).toContain("'orientation',");
    expect(runner).toContain("'landscape-left'");
    expect(runner).toContain("runIndependentIosSystemAction('home')");
    expect(runner.indexOf("'user_rotation',\n          '1'")).toBeLessThan(
      runner.indexOf("'user_rotation',\n        '0'")
    );
    expect(isolatedRunner).toContain('scenarios.filter(({ platforms }) =>');
    expect(isolatedRunner).toContain("'--testNamePattern'");
    expect(isolatedRunner).toContain("driver === 'agent-device' && !passed");
    expect(isolatedRunner).toContain(
      'const reachedContractAssertion = existsSync(outcomeFile)'
    );
    expect(isolatedRunner).not.toContain(
      "existsSync(resolve(agentDeviceRoot, scenario.id, 'gesture-start-marker.png'))"
    );
    expect(isolatedRunner).toContain('scenario.id');
    expect(isolatedRunner).toContain('timeout: 240000');
    expect(isolatedRunner).toContain(
      "'scripts/prepare-agent-device-ios-runner.mjs'"
    );
    expect(
      isolatedRunner.indexOf('prepare-agent-device-ios-runner')
    ).toBeLessThan(
      isolatedRunner.indexOf('for (const scenario of applicable)')
    );
    expect(isolatedRunner).toContain('process.exit(75)');
    expect(isolatedRunner).toContain(
      "resolve('node_modules/.bin/agent-device')"
    );
    expect(isolatedRunner).toMatch(/AGENT_DEVICE_STATE_DIR:\s*replayStateRoot/);
    expect(isolatedRunner).toContain(
      'if (requiresAgentDevice) stopReplayDaemon()'
    );
    expect(isolatedRunner).not.toMatch(/retry|retries/i);
    expect(iosRunnerPreflight).toMatch(
      /runAgentDevice\(\s*'prepare',\s*'ios-runner'/
    );
    expect(iosRunnerPreflight).toMatch(/'--timeout',\s*'300000'/);
    expect(iosRunnerPreflight).toContain(
      "runSessionCommand('alert', 'accept')"
    );
    expect(iosRunnerPreflight).toContain(
      "runSessionCommand('open', 'reorderable.example', '--relaunch')"
    );
    expect(iosRunnerPreflight).toContain(
      "runSessionCommand('wait', initialOutcome, '15000', '--depth', '100')"
    );
    expect(iosRunnerPreflight).toContain("'deep-link-confirmed'");
    expect(iosRunnerPreflight).toContain('let prepared = false');
    expect(iosRunnerPreflight).toMatch(
      /if \(!prepared\) runAgentDevice\('daemon', 'stop'\)/
    );
    expect(iosRunnerPreflight).toContain('stopDefaultDaemon');
    expect(jobRunner).toContain('scripts/run-device-contract-isolated.mjs');
    expect(workflow).toContain('scripts/run-device-contract-job.mjs');
  });
});
