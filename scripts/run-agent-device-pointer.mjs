import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const {
  predecessorBeforeTarget,
} = require('../e2e/contracts/pointer-planning.cjs');
const {
  agentDeviceReplayScript,
  observedLabelsFromSnapshot,
} = require('../e2e/contracts/outcome-observation.cjs');
const pointerTiming = require('../e2e/contracts/pointer-timing.json');
const feedbackFirstSampleMs =
  pointerTiming.sourceHoldMs +
  pointerTiming.moveBudgetMs +
  pointerTiming.settleMarginMs;
const [configuration, scenarioId, outcomePath] = process.argv.slice(2);
if (!configuration || !scenarioId || !outcomePath)
  throw new Error(
    'Usage: node scripts/run-agent-device-pointer.mjs <configuration> <scenario> <outcome-path>'
  );

const scenarios = JSON.parse(await readFile('e2e/contracts/scenarios.json'));
const drivers = JSON.parse(
  await readFile('e2e/contracts/pointer-drivers.json')
);
const scenario = scenarios.find(({ id }) => id === scenarioId);
const override = drivers.overrides[configuration]?.[scenarioId];
const platform = configuration.startsWith('android') ? 'android' : 'ios';
const engine =
  configuration === 'ios27.fallback' || configuration === 'android.fallback'
    ? 'fallback'
    : 'auto';
if (!scenario || override?.driver !== 'agent-device')
  throw new Error(
    `No Agent Device pointer route for ${configuration}/${scenarioId}`
  );

let targetId;
if (platform === 'android') {
  const attachedDevices = (await execFileAsync('adb', ['devices'])).stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === 'device')
    .map(([serial]) => serial);
  targetId = process.env.ANDROID_SERIAL ?? attachedDevices[0];
  if (!targetId || !attachedDevices.includes(targetId))
    throw new Error('An available Android device is required');
  await execFileAsync('adb', [
    '-s',
    targetId,
    'install',
    '-r',
    'example/android/app/build/outputs/apk/release/app-release.apk',
  ]);
} else {
  const devices = JSON.parse(
    (
      await execFileAsync('xcrun', [
        'simctl',
        'list',
        'devices',
        'available',
        '-j',
      ])
    ).stdout
  );
  const runtimeVersion = configuration.startsWith('ios26')
    ? 'iOS-26-5'
    : 'iOS-27-0';
  const runtime = Object.entries(devices.devices).find(([key]) =>
    key.includes(runtimeVersion)
  )?.[1];
  const target = runtime?.find(({ name }) => name === 'iPhone 17 Pro');
  if (!target)
    throw new Error(`${runtimeVersion} iPhone 17 Pro simulator is unavailable`);
  targetId = target.udid;
  await execFileAsync('xcrun', ['simctl', 'boot', targetId]).catch(
    () => undefined
  );
  await execFileAsync('xcrun', ['simctl', 'bootstatus', targetId, '-b']);
  await execFileAsync('xcrun', [
    'simctl',
    'uninstall',
    targetId,
    'reorderable.example',
  ]).catch(() => undefined);
  await execFileAsync('xcrun', [
    'simctl',
    'install',
    targetId,
    'example/ios/build/Build/Products/Release-iphonesimulator/ReorderableExample.app',
  ]);
}

const sessionName = `issue39-${scenarioId}`;
const sessionDeviceArgs = platform === 'ios' ? ['--udid', targetId] : [];
const agentDevice = resolve('node_modules/.bin/agent-device');
const feedbackDirectory = resolve(
  process.env.ISSUE39_FEEDBACK_DIR ??
    `artifacts/issue-39/feedback/${configuration}/${scenarioId}`
);
const recordingDirectory = resolve(
  process.env.ISSUE39_AGENT_DEVICE_DIR ??
    `artifacts/issue-39/agent-device/${configuration}/${scenarioId}`
);
await mkdir(feedbackDirectory, { recursive: true });
await mkdir(recordingDirectory, { recursive: true });
const replayStateRoot = resolve(
  'artifacts/issue-39/agent-device',
  configuration,
  'replay-daemon-state'
);
await mkdir(replayStateRoot, { recursive: true });
const deepLinkConfirmationMarker = resolve(
  replayStateRoot,
  'deep-link-confirmed'
);
const acceptDeepLinkPrompt =
  platform === 'ios' &&
  !(await stat(deepLinkConfirmationMarker)
    .then(() => true)
    .catch(() => false));
const replayEnvironment = {
  ...process.env,
  AGENT_DEVICE_STATE_DIR: replayStateRoot,
};
const runSessionCommand = (...args) =>
  execFileAsync(agentDevice, [
    ...args,
    '--session',
    sessionName,
    ...sessionDeviceArgs,
  ], { env: replayEnvironment });
const screenshot = async (path) => {
  if (platform === 'android') {
    const { stdout } = await execFileAsync(
      'adb',
      ['-s', targetId, 'exec-out', 'screencap', '-p'],
      { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 }
    );
    await writeFile(path, stdout);
    return;
  }
  await execFileAsync('xcrun', ['simctl', 'io', targetId, 'screenshot', path]);
};
const wait = (milliseconds) =>
  new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
let replay;
let replayExited = false;
try {
  const sourceSelector = `label="${scenario.action.sourceLabel}"`;
  const destinationLabel =
    override.destinationSelector.relation === 'predecessorCenter'
      ? (override.destinationSelector.label ??
        override.labelsById[
          predecessorBeforeTarget(
            override.canonicalOrder,
            scenario.expected.sourceIds,
            { sectionId: null, beforeId: override.destinationId }
          )
        ])
      : override.destinationSelector.label;
  if (destinationLabel == null)
    throw new Error(
      `No public destination selector for ${configuration}/${scenarioId}`
    );
  const destinationSelector = `label="${destinationLabel}"`;
  const replayPath = resolve(recordingDirectory, 'pointer-replay.ad');
  const recordingPath = resolve(recordingDirectory, 'pointer.mp4');
  const baselinePath = resolve(feedbackDirectory, 'baseline.png');
  const gestureMarkerPath = resolve(
    recordingDirectory,
    'gesture-start-marker.png'
  );
  const expectedLabels = scenario.expected.labels ?? [
    `Current selection: ${scenario.expected.selection}`,
    `Callback count: ${scenario.expected.callbackCount}`,
  ];
  await writeFile(
    replayPath,
    agentDeviceReplayScript({
      acceptDeepLinkPrompt,
      baselinePath,
      deepLink: scenario.deepLink.replace('${ENGINE}', engine),
      destinationSelector,
      expectedLabels,
      gestureMarkerPath,
      initialLabels: scenario.initial?.labels ?? ['Callback count: 0'],
      platform,
      recordingPath,
      sourceSelector,
      terminalPath: resolve(feedbackDirectory, 'terminal.png'),
      timing: pointerTiming,
    })
  );
  const previousBaselineMtime = await stat(baselinePath)
    .then(({ mtimeMs }) => mtimeMs)
    .catch(() => 0);
  const previousGestureMarkerMtime = await stat(gestureMarkerPath)
    .then(({ mtimeMs }) => mtimeMs)
    .catch(() => 0);
  replay = spawn(
    agentDevice,
    [
      'replay',
      replayPath,
      '--timeout',
      '180000',
      '--platform',
      platform,
      '--session',
      sessionName,
      ...sessionDeviceArgs,
    ],
    { env: replayEnvironment, stdio: 'inherit' }
  );
  let replayExitCode;
  const replayExit = new Promise((resolveExit) =>
    replay.once('exit', (code) => {
      replayExited = true;
      replayExitCode = code;
      resolveExit(code);
    })
  );
  const baselineDeadline = Date.now() + 180000;
  while (
    (await stat(baselinePath)
      .then(({ mtimeMs }) => mtimeMs <= previousBaselineMtime)
      .catch(() => true)) &&
    replayExitCode == null &&
    Date.now() < baselineDeadline
  ) {
    await wait(100);
  }
  if (replayExitCode != null)
    throw new Error(
      `Agent Device replay exited ${replayExitCode} before baseline`
    );
  if (Date.now() >= baselineDeadline)
    throw new Error('Timed out waiting for the replay baseline marker');
  if (platform === 'ios') await writeFile(deepLinkConfirmationMarker, '');
  await screenshot(baselinePath);
  const gestureMarkerDeadline = Date.now() + 60000;
  while (
    (await stat(gestureMarkerPath)
      .then(({ mtimeMs }) => mtimeMs <= previousGestureMarkerMtime)
      .catch(() => true)) &&
    replayExitCode == null &&
    Date.now() < gestureMarkerDeadline
  ) {
    await wait(100);
  }
  if (replayExitCode != null)
    throw new Error(
      `Agent Device replay exited ${replayExitCode} before gesture marker`
    );
  if (Date.now() >= gestureMarkerDeadline)
    throw new Error('Timed out waiting for the replay gesture marker');
  await wait(feedbackFirstSampleMs);

  for (let index = 1; index <= pointerTiming.sampleCount; index += 1) {
    await screenshot(resolve(feedbackDirectory, `sample-${index}.png`));
    if (index < pointerTiming.sampleCount)
      await wait(pointerTiming.sampleIntervalMs);
  }
  const replayResult = await replayExit;
  let snapshot;
  let observedOutcome;
  try {
    for (const label of expectedLabels)
      await runSessionCommand('wait', label, '15000', '--depth', '100');
    const snapshotResult = await runSessionCommand(
      'snapshot',
      '--force-full',
      '--depth',
      '100',
      '--json'
    );
    snapshot = JSON.parse(snapshotResult.stdout);
    observedOutcome = observedLabelsFromSnapshot(
      snapshot,
      expectedLabels,
      'reorderable.example'
    );
  } catch (observationError) {
    if (replayResult !== 0)
      throw new Error(
        `Agent Device replay exited ${replayResult} and terminal observation failed`,
        { cause: observationError }
      );
    throw observationError;
  }
  await writeFile(
    resolve(recordingDirectory, 'terminal-accessibility.json'),
    `${JSON.stringify(snapshot, null, 2)}\n`
  );
  await mkdir(dirname(resolve(outcomePath)), { recursive: true });
  await writeFile(
    resolve(outcomePath),
    `${JSON.stringify(
      {
        configuration,
        engine,
        platform,
        outcomes: {
          [scenarioId]: observedOutcome,
        },
      },
      null,
      2
    )}\n`
  );
} finally {
  if (replay != null && !replayExited) {
    replay.kill('SIGTERM');
    await wait(500);
    if (!replayExited) replay.kill('SIGKILL');
  }
  await runSessionCommand('close').catch(() => undefined);
}
