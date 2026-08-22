import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';

type PhysicalReport = Record<string, any>;

function evaluateVerifier(file: string, expression: string): any {
  const verifierUrl = JSON.stringify(`file://${resolve(process.cwd(), file)}`);
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `const verifier = await import(${verifierUrl}); console.log(JSON.stringify(${expression}));`,
      ],
      { encoding: 'utf8' }
    )
  );
}

function passingReport(platform: 'ios' | 'android'): PhysicalReport {
  return {
    schemaVersion: 1,
    platform,
    agentDeviceVersion: '0.20.6',
    buildMode: 'Release',
    geometryOwner: 'production',
    device: {
      kind: 'physical',
      minimumSupported: true,
      model: platform === 'ios' ? 'minimum-ios' : 'minimum-android',
      osVersion: platform === 'ios' ? '15.1' : '24',
    },
    dataset: { rowCount: 10_000 },
    control: {
      mountedCells: 30,
      renderedCells: 30,
      settleMs: 30,
      idle: {
        cpuPercent: 0.5,
        frameCount: 150,
        missedFramePercent: 0,
      },
      active: { frameCount: 150, missedDeadlinePercent: 2 },
    },
    fallback: {
      mountedCells: 31,
      renderedCells: 31,
      settleMs: 45,
      listSizeProportionalReactWork: false,
      idle: {
        cpuPercent: 1.4,
        frameCount: 150,
        missedFramePercent: 0,
        continuousTimer: false,
        continuousFrameCallback: false,
      },
      active: {
        frameCount: 150,
        missedDeadlinePercent: 3.9,
        p95LibraryUiWorkMs: 3.8,
        pointerJsCalls: 0,
      },
    },
    memory: {
      warmGeometryBytes: 8_900_000,
      coldWorkletsActivationBytes: 60_000_000,
    },
    geometry: {
      maximumLookupSteps: 14,
      maximumCorrectionMs: 0.9,
      maximumCorrectionsPerFrame: 4,
      maximumAnchorDisplacementPx: 2,
      mutationComplexity: 'O(log n)',
      copiedListSizeArrays: false,
    },
    finalization: { jsResults: 1, reorderCommits: 1 },
    evidence: ['screenshot.png', 'metrics.json', 'frames.json'],
  };
}

describe('issue #40 publication gates', () => {
  it('accepts one minimum physical report for each platform', () => {
    expect(
      evaluateVerifier(
        'scripts/verify-physical-performance.mjs',
        `verifier.verifyPhysicalPerformanceMatrix(${JSON.stringify([
          passingReport('ios'),
          passingReport('android'),
        ])})`
      )
    ).toEqual([]);
  });

  it.each([
    [
      'simulator evidence',
      (report: PhysicalReport) => (report.device.kind = 'simulator'),
      'device must be physical',
    ],
    [
      'unpinned Agent Device',
      (report: PhysicalReport) => (report.agentDeviceVersion = '0.20.5'),
      'Agent Device 0.20.6 is required',
    ],
    [
      'non-minimum hardware',
      (report: PhysicalReport) => (report.device.minimumSupported = false),
      'minimum-supported',
    ],
    [
      'newer operating system',
      (report: PhysicalReport) => (report.device.osVersion = '27'),
      'OS version must equal the minimum supported',
    ],
    [
      'virtualization growth',
      (report: PhysicalReport) => (report.fallback.renderedCells = 33),
      'rendered cells',
    ],
    [
      'idle scheduling',
      (report: PhysicalReport) =>
        (report.fallback.idle.continuousFrameCallback = true),
      'continuous frame callback',
    ],
    [
      'settle latency',
      (report: PhysicalReport) => (report.fallback.settleMs = 61),
      'twice FlatList',
    ],
    [
      'warm geometry memory',
      (report: PhysicalReport) =>
        (report.memory.warmGeometryBytes = 10_000_000),
      'warm geometry',
    ],
    [
      'active frame health',
      (report: PhysicalReport) =>
        (report.fallback.active.missedDeadlinePercent = 5),
      'at least 5%',
    ],
    [
      'empty active frame sample',
      (report: PhysicalReport) => (report.control.active.frameCount = 0),
      'active frame samples must contain attributable frames',
    ],
    [
      'UI-runtime work',
      (report: PhysicalReport) =>
        (report.fallback.active.p95LibraryUiWorkMs = 4.1),
      'p95 library UI work',
    ],
    [
      'lookup complexity',
      (report: PhysicalReport) => (report.geometry.maximumLookupSteps = 16),
      'lookup step',
    ],
    [
      'measurement correction',
      (report: PhysicalReport) => (report.geometry.maximumCorrectionMs = 1.1),
      'correction latency',
    ],
    [
      'terminal cardinality',
      (report: PhysicalReport) => (report.finalization.jsResults = 2),
      'terminal JS result',
    ],
  ])('rejects %s outside budget', (_name, mutate, expected) => {
    const report = passingReport('ios');
    mutate(report);

    expect(
      evaluateVerifier(
        'scripts/verify-physical-performance.mjs',
        `verifier.verifyPhysicalPerformanceReport(${JSON.stringify(report)})`
      ).join('\n')
    ).toContain(expected);
  });

  it('fails a Reassure render-count increase and significant slowdown', () => {
    const measurement = {
      name: 'critical list path',
      baseline: { meanCount: 2 },
      current: { meanCount: 3 },
      durationDiff: 1.25,
      isDurationDiffSignificant: true,
    };
    const output = {
      errors: [],
      countChanged: [measurement],
      significant: [measurement],
    };
    const failures = evaluateVerifier(
      'scripts/verify-reassure-output.mjs',
      `verifier.verifyReassureOutput(${JSON.stringify(output)}, undefined, [])`
    );

    expect(failures).toEqual([
      'critical list path: render count increased from 2 to 3',
      'critical list path: statistically significant slowdown of 1.250 ms',
    ]);
  });

  it('uses paired plain scenarios as timing controls', () => {
    const measurement = {
      name: 'paired plain FlatList critical render path',
      baseline: { meanCount: 2 },
      current: { meanCount: 2 },
      durationDiff: 0.101,
      isDurationDiffSignificant: true,
    };

    expect(
      evaluateVerifier(
        'scripts/verify-reassure-output.mjs',
        `verifier.verifyReassureOutput(${JSON.stringify({
          significant: [measurement],
        })}, undefined, [])`
      )
    ).toEqual([]);
  });

  it('only accepts a duration regression with an auditable reason', () => {
    const baselineCommit = 'a'.repeat(40);
    const measurement = {
      name: 'critical children path',
      durationDiff: 1.25,
      isDurationDiffSignificant: true,
    };

    const invalid = evaluateVerifier(
      'scripts/verify-reassure-output.mjs',
      `(() => { try { verifier.verifyReassureOutput(${JSON.stringify({
        metadata: { baseline: { commitHash: baselineCommit } },
        significant: [measurement],
      })}, ${JSON.stringify({
        regressions: [
          {
            name: measurement.name,
            metric: 'duration',
            baselineCommit,
            reason: '',
          },
        ],
      })}, []); return null; } catch (error) { return error.message; } })()`
    );
    expect(invalid).toContain('non-empty reason');
    const renderCountAcceptance = evaluateVerifier(
      'scripts/verify-reassure-output.mjs',
      `(() => { try { verifier.verifyReassureOutput({}, ${JSON.stringify({
        regressions: [
          {
            name: measurement.name,
            metric: 'render-count',
            baselineCommit,
            reason: 'Render count increases must still fail.',
          },
        ],
      })}, []); return null; } catch (error) { return error.message; } })()`
    );
    expect(renderCountAcceptance).toContain(
      'render-count increases cannot be accepted'
    );
    expect(
      evaluateVerifier(
        'scripts/verify-reassure-output.mjs',
        `verifier.verifyReassureOutput(${JSON.stringify({
          metadata: { baseline: { commitHash: baselineCommit } },
          significant: [measurement],
        })}, ${JSON.stringify({
          regressions: [
            {
              name: measurement.name,
              metric: 'duration',
              baselineCommit,
              reason: 'Accepted in the reviewed performance change.',
            },
          ],
        })}, [])`
      )
    ).toEqual([]);
  });
});
