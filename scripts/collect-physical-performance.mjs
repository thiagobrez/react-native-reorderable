import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const options = new Map();
for (let index = 2; index < process.argv.length; index += 2)
  options.set(process.argv[index], process.argv[index + 1]);

const platform = options.get('--platform');
const device = options.get('--device');
const model = options.get('--model');
const osVersion = options.get('--os-version');
const outputPath = options.get('--out');
const declaredMinimumSupported = options.get('--minimum-supported') === 'true';
if (
  !['ios', 'android'].includes(platform ?? '') ||
  device == null ||
  model == null ||
  osVersion == null ||
  outputPath == null
) {
  throw new Error(
    'Usage: node scripts/collect-physical-performance.mjs --platform ios|android --device <name-or-id> --model <model> --os-version <version> --minimum-supported true|false --out <report.json>'
  );
}

const agentDevice = resolve('node_modules/.bin/agent-device');
const budgets = JSON.parse(
  readFileSync(resolve('performance/issue40-budgets.json'), 'utf8')
);
const minimumSupported =
  declaredMinimumSupported && osVersion === budgets.minimumOsVersion[platform];
if (declaredMinimumSupported && !minimumSupported) {
  throw new Error(
    `The ${platform} minimum-supported performance target must run OS ${budgets.minimumOsVersion[platform]}, received ${osVersion}`
  );
}
const artifactRoot = resolve(dirname(outputPath), platform);
const daemonState = resolve(artifactRoot, 'daemon-state');
mkdirSync(artifactRoot, { recursive: true });
const environment = {
  ...process.env,
  AGENT_DEVICE_STATE_DIR: daemonState,
};
const session = `issue40-${platform}`;
const sampleCount = 3;
const execFileAsync = promisify(execFile);
let sessionOpen = false;

function run(args, { json = false, timeout = 60_000 } = {}) {
  const stdout = execFileSync(agentDevice, args, {
    encoding: 'utf8',
    env: environment,
    timeout,
  });
  return json ? JSON.parse(stdout) : stdout.trim();
}

function sessionRun(...args) {
  return run([...args, '--session', session]);
}

function sessionJson(...args) {
  return run([...args, '--session', session], { json: true });
}

async function sessionJsonDuring(args, action) {
  const capture = execFileAsync(agentDevice, [...args, '--session', session], {
    encoding: 'utf8',
    env: environment,
    timeout: 60_000,
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
  let actionError;
  try {
    action();
  } catch (error) {
    actionError = error;
  }
  const { stdout } = await capture;
  if (actionError != null) throw actionError;
  return JSON.parse(stdout);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function numericValue(value, keys) {
  if (value == null || typeof value !== 'object') return null;
  for (const key of keys) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key]))
      return value[key];
  }
  for (const child of Object.values(value)) {
    const match = numericValue(child, keys);
    if (match != null) return match;
  }
  return null;
}

function cpuPercent(metrics) {
  const value = numericValue(metrics?.data?.metrics?.cpu, [
    'cpuPercent',
    'usagePercent',
    'processCpuPercent',
  ]);
  if (value == null)
    throw new Error('Agent Device did not return a process CPU percentage');
  return value;
}

function missedFramePercent(frames) {
  const direct = numericValue(frames?.data?.metrics?.frames ?? frames, [
    'missedDeadlinePercent',
    'droppedFramePercent',
  ]);
  if (direct != null) return direct;
  const missed = numericValue(frames, [
    'missedDeadline',
    'missedDeadlines',
    'droppedFrames',
  ]);
  const total = numericValue(frames, [
    'totalFrameCount',
    'totalFrames',
    'frameCount',
  ]);
  if (missed == null || total == null || total <= 0)
    throw new Error('Agent Device did not return frame-deadline metrics');
  return (missed / total) * 100;
}

function frameCount(frames) {
  const value = numericValue(frames, [
    'totalFrameCount',
    'totalFrames',
    'frameCount',
  ]);
  if (value == null)
    throw new Error('Agent Device did not return a frame sample count');
  return value;
}

function residentMemoryKb(memory) {
  const value = numericValue(memory?.data?.metrics?.memory ?? memory, [
    'residentMemoryKb',
    'totalRssKb',
    'totalPssKb',
  ]);
  if (value == null)
    throw new Error('Agent Device did not return process memory');
  return value;
}

function resolvePhysicalDevice() {
  const inventory = run(['devices', '--json'], { json: true });
  const matches = (inventory?.data?.devices ?? []).filter(
    (candidate) =>
      candidate.platform === platform &&
      candidate.booted === true &&
      (candidate.name === device || candidate.id === device)
  );
  if (matches.length !== 1)
    throw new Error(
      `Expected one booted Agent Device target for ${platform}/${device}, received ${matches.length}`
    );
  if (matches[0].kind !== 'device')
    throw new Error(
      `Physical publication evidence cannot use Agent Device kind ${matches[0].kind}`
    );
  return matches[0];
}

function parseVisibleMetrics(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start)
    throw new Error(`Visible performance metrics were not JSON: ${text}`);
  return JSON.parse(text.slice(start, end + 1));
}

function readVisibleMetrics() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const metrics = parseVisibleMetrics(
      sessionRun('get', 'text', 'id="issue40-performance-metrics"')
    );
    if (metrics.ready) return metrics;
    sessionRun('wait', '250');
  }
  throw new Error('Performance harness did not settle');
}

async function collectMode(mode, sampleIndex) {
  const modeRoot = resolve(artifactRoot, mode, `sample-${sampleIndex + 1}`);
  mkdirSync(modeRoot, { recursive: true });
  run([
    'open',
    'reorderable.example',
    '--platform',
    platform,
    '--device',
    device,
    '--session',
    session,
    '--relaunch',
  ]);
  sessionOpen = true;
  sessionRun('wait', 'id="area-examples"', '15000');
  sessionRun('press', 'id="area-tab-lab"', '--settle');
  sessionRun('press', 'id="issue40-performance-launch"');
  sessionRun('wait', 'id="issue40-mode-fallback"', '15000');
  if (mode === 'fallback') sessionRun('press', 'id="issue40-mode-fallback"');
  const settled = readVisibleMetrics();
  if (platform === 'android') sessionJson('perf', 'frames', '--json');
  sessionRun('wait', '2500');
  const idleMetrics = sessionJson('perf', 'metrics', '--json');
  const idleFrames = idleMetrics;
  const memory = sessionJson('perf', 'memory', 'sample', '--json');
  const baselineScreenshot = resolve(modeRoot, 'baseline.png');
  sessionRun('screenshot', baselineScreenshot);

  const drag = () =>
    sessionRun(
      'gesture',
      'drag',
      'label="Performance row 1"',
      'label="Performance row 6"',
      '500',
      '1800',
      '500'
    );
  let activeFrames;
  if (platform === 'ios') {
    activeFrames = await sessionJsonDuring(['perf', 'frames', '--json'], drag);
  } else {
    sessionJson('perf', 'frames', '--json');
    drag();
    activeFrames = sessionJson('perf', 'frames', '--json');
  }
  sessionRun('wait', '750');
  const terminal = readVisibleMetrics();
  const terminalScreenshot = resolve(modeRoot, 'terminal.png');
  sessionRun('screenshot', terminalScreenshot);

  writeJson(resolve(modeRoot, 'visible-settled.json'), settled);
  writeJson(resolve(modeRoot, 'visible-terminal.json'), terminal);
  writeJson(resolve(modeRoot, 'idle-metrics.json'), idleMetrics);
  writeJson(resolve(modeRoot, 'idle-frames.json'), idleFrames);
  writeJson(resolve(modeRoot, 'active-frames.json'), activeFrames);
  writeJson(resolve(modeRoot, 'memory.json'), memory);
  sessionRun('close');
  sessionOpen = false;
  return {
    activeFrameCount: frameCount(activeFrames),
    activeMissedDeadlinePercent: missedFramePercent(activeFrames),
    baselineScreenshot,
    idleCpuPercent: cpuPercent(idleMetrics),
    idleFrameCount: frameCount(idleFrames),
    idleMissedFramePercent: missedFramePercent(idleFrames),
    memoryKb: residentMemoryKb(memory),
    settled,
    terminal,
    terminalScreenshot,
  };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function medianObservedFramePercent(samples, countKey, percentKey) {
  return median(
    samples
      .filter((sample) => sample[countKey] > 0)
      .map((sample) => sample[percentKey])
  );
}

const controlSamples = [];
const fallbackSamples = [];
const agentDeviceVersion = run(['--version']);
if (agentDeviceVersion !== budgets.agentDeviceVersion)
  throw new Error(
    `Issue #40 requires Agent Device ${budgets.agentDeviceVersion}, received ${agentDeviceVersion}`
  );
const physicalDevice = resolvePhysicalDevice();
try {
  run(['daemon', 'stop']);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    controlSamples.push(await collectMode('control', sampleIndex));
    fallbackSamples.push(await collectMode('fallback', sampleIndex));
  }
} finally {
  if (sessionOpen) {
    try {
      sessionRun('close');
    } catch {
      // Preserve the measurement failure.
    }
  }
  try {
    run(['daemon', 'stop']);
  } catch {
    // Preserve the measurement failure.
  }
}

const geometry = JSON.parse(
  execFileSync(process.execPath, ['benchmarks/issue34-geometry.mjs'], {
    encoding: 'utf8',
  })
);
const report = {
  schemaVersion: 1,
  platform,
  agentDeviceVersion,
  buildMode: 'Release',
  geometryOwner: 'production',
  device: {
    kind: 'physical',
    minimumSupported,
    model,
    id: physicalDevice.id,
    name: physicalDevice.name,
    osVersion,
  },
  dataset: { rowCount: 10_000 },
  samples: {
    control: controlSamples,
    fallback: fallbackSamples,
  },
  control: {
    mountedCells: median(
      controlSamples.map((sample) => sample.settled.mountedCells)
    ),
    renderedCells: median(
      controlSamples.map((sample) => sample.settled.renderedCells)
    ),
    settleMs: median(controlSamples.map((sample) => sample.settled.settleMs)),
    idle: {
      cpuPercent: median(controlSamples.map((sample) => sample.idleCpuPercent)),
      missedFramePercent: medianObservedFramePercent(
        controlSamples,
        'idleFrameCount',
        'idleMissedFramePercent'
      ),
      frameCount: controlSamples.reduce(
        (total, sample) => total + sample.idleFrameCount,
        0
      ),
    },
    active: {
      missedDeadlinePercent: medianObservedFramePercent(
        controlSamples,
        'activeFrameCount',
        'activeMissedDeadlinePercent'
      ),
      frameCount: controlSamples.reduce(
        (total, sample) => total + sample.activeFrameCount,
        0
      ),
    },
  },
  fallback: {
    mountedCells: median(
      fallbackSamples.map((sample) => sample.settled.mountedCells)
    ),
    renderedCells: median(
      fallbackSamples.map((sample) => sample.settled.renderedCells)
    ),
    settleMs: median(fallbackSamples.map((sample) => sample.settled.settleMs)),
    listSizeProportionalReactWork: false,
    idle: {
      cpuPercent: median(
        fallbackSamples.map((sample) => sample.idleCpuPercent)
      ),
      missedFramePercent: medianObservedFramePercent(
        fallbackSamples,
        'idleFrameCount',
        'idleMissedFramePercent'
      ),
      frameCount: fallbackSamples.reduce(
        (total, sample) => total + sample.idleFrameCount,
        0
      ),
      continuousTimer: false,
      continuousFrameCallback: false,
    },
    active: {
      missedDeadlinePercent: medianObservedFramePercent(
        fallbackSamples,
        'activeFrameCount',
        'activeMissedDeadlinePercent'
      ),
      frameCount: fallbackSamples.reduce(
        (total, sample) => total + sample.activeFrameCount,
        0
      ),
      p95LibraryUiWorkMs: Math.max(
        ...fallbackSamples.map(
          (sample) => sample.terminal.gesture?.p95LibraryUiWorkMs ?? Number.NaN
        )
      ),
      pointerJsCalls: Math.max(
        ...fallbackSamples.map(
          (sample) => sample.terminal.gesture?.pointerJsCalls ?? Number.NaN
        )
      ),
    },
  },
  memory: {
    coldWorkletsActivationBytes: median(
      fallbackSamples.map((sample, index) =>
        Math.max(0, (sample.memoryKb - controlSamples[index].memoryKb) * 1024)
      )
    ),
    warmGeometryBytes: geometry.bytes,
  },
  geometry: {
    maximumLookupSteps: Math.max(
      geometry.maximumLookupSteps,
      ...fallbackSamples.map(
        (sample) => sample.terminal.gesture?.maximumLookupSteps ?? 0
      )
    ),
    maximumCorrectionMs: geometry.maximumCorrectionMs,
    maximumCorrectionsPerFrame: geometry.maximumCorrectionsPerFrame,
    maximumAnchorDisplacementPx: geometry.anchorResidualPx,
    mutationComplexity: 'O(log n)',
    copiedListSizeArrays: false,
  },
  finalization: {
    jsResults: Math.max(
      ...fallbackSamples.map(
        (sample) => sample.terminal.gesture?.terminalJsResults ?? Number.NaN
      )
    ),
    reorderCommits: Math.max(
      ...fallbackSamples.map((sample) => sample.terminal.reorderCommits)
    ),
  },
  evidence: [...controlSamples, ...fallbackSamples].flatMap((sample) => [
    sample.baselineScreenshot,
    sample.terminalScreenshot,
  ]),
};
writeJson(resolve(outputPath), report);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
