import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const budgets = JSON.parse(
  await readFile(
    new URL('../performance/issue40-budgets.json', import.meta.url),
    'utf8'
  )
);

function finite(report, path, failures) {
  let value = report;
  for (const part of path.split('.')) value = value?.[part];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    failures.push(`${report.platform ?? 'unknown'}: ${path} must be finite`);
    return Number.POSITIVE_INFINITY;
  }
  return value;
}

function expect(report, condition, message, failures) {
  if (!condition) failures.push(`${report.platform ?? 'unknown'}: ${message}`);
}

export function verifyPhysicalPerformanceReport(report) {
  const failures = [];
  const platform = report.platform;
  expect(
    report,
    report.schemaVersion === budgets.schemaVersion,
    'unsupported report schema',
    failures
  );
  expect(
    report,
    report.agentDeviceVersion === budgets.agentDeviceVersion,
    `Agent Device ${budgets.agentDeviceVersion} is required`,
    failures
  );
  expect(
    report,
    platform === 'ios' || platform === 'android',
    'platform must be ios or android',
    failures
  );
  expect(
    report,
    report.device?.kind === 'physical',
    'device must be physical',
    failures
  );
  expect(
    report,
    report.device?.minimumSupported === true,
    'device must be a declared minimum-supported target',
    failures
  );
  expect(
    report,
    report.device?.osVersion === budgets.minimumOsVersion[platform],
    `OS version must equal the minimum supported ${budgets.minimumOsVersion[platform] ?? 'target'}`,
    failures
  );
  expect(
    report,
    report.buildMode === 'Release',
    'measurements must use a Release build',
    failures
  );
  expect(
    report,
    report.geometryOwner === 'production',
    'measurements must use the production geometry owner',
    failures
  );
  expect(
    report,
    report.dataset?.rowCount === budgets.rowCount,
    `dataset must contain ${budgets.rowCount} rows`,
    failures
  );
  expect(
    report,
    Array.isArray(report.evidence) && report.evidence.length > 0,
    'evidence artifacts are required',
    failures
  );

  const controlMounted = finite(report, 'control.mountedCells', failures);
  const fallbackMounted = finite(report, 'fallback.mountedCells', failures);
  const controlRendered = finite(report, 'control.renderedCells', failures);
  const fallbackRendered = finite(report, 'fallback.renderedCells', failures);
  expect(
    report,
    Math.abs(fallbackMounted - controlMounted) <=
      budgets.virtualizationCellDelta,
    'mounted cells exceed paired FlatList ±2',
    failures
  );
  expect(
    report,
    Math.abs(fallbackRendered - controlRendered) <=
      budgets.virtualizationCellDelta,
    'rendered cells exceed paired FlatList ±2',
    failures
  );
  expect(
    report,
    report.fallback?.listSizeProportionalReactWork === false,
    'list-size-proportional React work is forbidden',
    failures
  );

  const controlIdleCpu = finite(report, 'control.idle.cpuPercent', failures);
  const fallbackIdleCpu = finite(report, 'fallback.idle.cpuPercent', failures);
  const controlIdleMissed = finite(
    report,
    'control.idle.missedFramePercent',
    failures
  );
  const fallbackIdleMissed = finite(
    report,
    'fallback.idle.missedFramePercent',
    failures
  );
  const controlIdleFrames = finite(report, 'control.idle.frameCount', failures);
  const fallbackIdleFrames = finite(
    report,
    'fallback.idle.frameCount',
    failures
  );
  expect(
    report,
    report.fallback?.idle?.continuousTimer === false,
    'idle continuous timer is forbidden',
    failures
  );
  expect(
    report,
    report.fallback?.idle?.continuousFrameCallback === false,
    'idle continuous frame callback is forbidden',
    failures
  );
  expect(
    report,
    fallbackIdleCpu - controlIdleCpu <= budgets.idleCpuDeltaPercentagePoints,
    'idle CPU delta exceeds one percentage point',
    failures
  );
  expect(
    report,
    fallbackIdleMissed - controlIdleMissed <=
      budgets.idleMissedFrameDeltaPercentagePoints,
    'idle missed-frame percentage exceeds FlatList',
    failures
  );
  expect(
    report,
    controlIdleFrames > 0 && fallbackIdleFrames > 0,
    'idle frame samples must contain attributable frames',
    failures
  );

  const controlSettle = finite(report, 'control.settleMs', failures);
  const fallbackSettle = finite(report, 'fallback.settleMs', failures);
  const platformSettleDelta = budgets.settleDeltaMs[platform] ?? -1;
  expect(
    report,
    fallbackSettle <= controlSettle * budgets.settleRatio,
    'settle exceeds twice FlatList',
    failures
  );
  expect(
    report,
    fallbackSettle - controlSettle <= platformSettleDelta,
    `settle delta exceeds ${platformSettleDelta} ms`,
    failures
  );

  const warmGeometryBytes = finite(
    report,
    'memory.warmGeometryBytes',
    failures
  );
  const coldWorkletsBytes = finite(
    report,
    'memory.coldWorkletsActivationBytes',
    failures
  );
  const warmBudget =
    budgets.warmGeometryFixedBytes +
    budgets.warmGeometryBytesPerItem * budgets.rowCount;
  expect(
    report,
    warmGeometryBytes <= warmBudget,
    `warm geometry exceeds ${warmBudget} bytes`,
    failures
  );
  expect(
    report,
    coldWorkletsBytes <= budgets.coldWorkletsActivationBytes,
    'cold Worklets activation exceeds 60 MiB',
    failures
  );

  const controlActiveMissed = finite(
    report,
    'control.active.missedDeadlinePercent',
    failures
  );
  const fallbackActiveMissed = finite(
    report,
    'fallback.active.missedDeadlinePercent',
    failures
  );
  const controlActiveFrames = finite(
    report,
    'control.active.frameCount',
    failures
  );
  const fallbackActiveFrames = finite(
    report,
    'fallback.active.frameCount',
    failures
  );
  const p95UiWork = finite(
    report,
    'fallback.active.p95LibraryUiWorkMs',
    failures
  );
  expect(
    report,
    fallbackActiveMissed < budgets.activeMissedDeadlinePercent,
    'active drag misses at least 5% of deadlines',
    failures
  );
  expect(
    report,
    fallbackActiveMissed - controlActiveMissed <=
      budgets.activeMissedDeadlineDeltaPercentagePoints,
    'active missed-deadline delta exceeds two percentage points',
    failures
  );
  expect(
    report,
    controlActiveFrames > 0 && fallbackActiveFrames > 0,
    'active frame samples must contain attributable frames',
    failures
  );
  expect(
    report,
    p95UiWork <= budgets.p95LibraryUiWorkMs,
    'p95 library UI work exceeds 4 ms',
    failures
  );
  expect(
    report,
    report.fallback?.active?.pointerJsCalls === 0,
    'pointer updates crossed into JavaScript',
    failures
  );

  const lookupSteps = finite(report, 'geometry.maximumLookupSteps', failures);
  const correctionMs = finite(report, 'geometry.maximumCorrectionMs', failures);
  const correctionsPerFrame = finite(
    report,
    'geometry.maximumCorrectionsPerFrame',
    failures
  );
  const anchorDisplacement = finite(
    report,
    'geometry.maximumAnchorDisplacementPx',
    failures
  );
  expect(
    report,
    report.geometry?.mutationComplexity === 'O(log n)',
    'geometry mutation must be O(log n)',
    failures
  );
  expect(
    report,
    report.geometry?.copiedListSizeArrays === false,
    'geometry must not copy list-size arrays',
    failures
  );
  expect(
    report,
    lookupSteps <= budgets.maximumLookupSteps,
    'lookup step budget exceeded',
    failures
  );
  expect(
    report,
    correctionMs <= budgets.maximumCorrectionMs,
    'correction latency budget exceeded',
    failures
  );
  expect(
    report,
    correctionsPerFrame <= budgets.maximumCorrectionsPerFrame,
    'corrections-per-frame budget exceeded',
    failures
  );
  expect(
    report,
    anchorDisplacement <= budgets.maximumAnchorDisplacementPx,
    'anchor displacement budget exceeded',
    failures
  );

  const terminalResults = finite(report, 'finalization.jsResults', failures);
  const commits = finite(report, 'finalization.reorderCommits', failures);
  expect(
    report,
    terminalResults === budgets.terminalJsResults,
    'terminal JS result count must equal one',
    failures
  );
  expect(
    report,
    commits <= budgets.maximumReorderCommits,
    'more than one reorder commit was observed',
    failures
  );
  return failures;
}

export function verifyPhysicalPerformanceMatrix(reports) {
  const failures = reports.flatMap(verifyPhysicalPerformanceReport);
  for (const platform of ['ios', 'android']) {
    const count = reports.filter(
      (report) => report.platform === platform
    ).length;
    if (count !== 1)
      failures.push(
        `matrix: expected exactly one ${platform} physical report, received ${count}`
      );
  }
  return failures;
}

async function main() {
  const paths = process.argv.slice(2);
  if (paths.length === 0)
    throw new Error(
      'Usage: node scripts/verify-physical-performance.mjs <ios-report.json> <android-report.json>'
    );
  const reports = await Promise.all(
    paths.map((path) => readFile(path, 'utf8').then(JSON.parse))
  );
  const failures = verifyPhysicalPerformanceMatrix(reports);
  if (failures.length > 0)
    throw new Error(
      `Physical performance publication gate failed:\n- ${failures.join('\n- ')}`
    );
  process.stdout.write(
    'Physical performance publication gate passed for iOS and Android.\n'
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
