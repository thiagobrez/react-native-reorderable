// Reproduction driver for the agent-device "lost touch stream" report (issue #84).
//
// Each iteration erases and cold-boots the target simulator, prepares the
// agent-device XCUITest runner, opens the Scenario Lab free-form scenario and
// issues the same `gesture drag` the device-contract job uses. It then records
// whether the app observed the drop (`Callback count` increments) and runs a
// small set of follow-up probes that tell the failure modes apart:
//
//   second-gesture   same app instance, same private event synthesis path
//   relaunch-gesture fresh app instance on the same booted simulator
//   xctest-tap       agent-device `press` (public XCTest coordinate tap)
//
// Usage:
//   node scripts/repro-cold-simulator-touch.mjs --runtime iOS-26-5 [--iterations 3] [--out artifacts/repro-cold-touch]
//
// The script never fails the job for a reproduced defect; results are written
// as JSON plus a table on stdout and $GITHUB_STEP_SUMMARY.

import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2)
  args.set(process.argv[index].replace(/^--/, ''), process.argv[index + 1]);
const runtimeVersion = args.get('runtime');
if (runtimeVersion == null)
  throw new Error(
    'Usage: node scripts/repro-cold-simulator-touch.mjs --runtime <iOS-26-5|iOS-27-0> [--iterations N] [--out DIR]'
  );
const iterations = Number(args.get('iterations') ?? 3);
const outRoot = resolve(args.get('out') ?? 'artifacts/repro-cold-touch');
const deviceName = args.get('device') ?? 'iPhone 17 Pro';
const appPath = resolve(
  'example/ios/build/Build/Products/Release-iphonesimulator/ReorderableExample.app'
);
const bundleId = 'reorderable.example';
const deepLink = 'reorderable://lab/free-form?preset=teaching&engine=auto';
const initialOrder =
  'Current order: card-0, card-1, card-2, card-3, card-4, card-5';
// The contract drag (card-0 before card-3). The follow-up drag on the same app
// instance moves the last card to the top so it always changes the order
// whatever the first drag did.
const contractDrag = { source: 'id="card-card-0"', destination: 'id="card-card-3"' };
const followUpDrag = { source: 'id="card-card-5"', destination: 'id="card-card-1"' };
const timing = { sourceHoldMs: 650, moveMs: 1200, destinationHoldMs: 8000 };
const agentDevice = resolve('node_modules/.bin/agent-device');
const sessionName = 'repro-cold-touch';

if (!existsSync(appPath)) throw new Error(`Missing app build at ${appPath}`);
mkdirSync(outRoot, { recursive: true });

const now = () => Date.now();
const iso = () => new Date().toISOString();
const log = (message) => console.log(`[${iso()}] ${message}`);

function run(command, commandArgs, options = {}) {
  const startedAt = now();
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 120000,
    env: options.env ?? process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    command: [command, ...commandArgs].join(' '),
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs: now() - startedAt,
    error: result.error?.message,
  };
}

function resolveTargetUdid() {
  const devices = run('xcrun', ['simctl', 'list', 'devices', 'available', '-j']);
  if (devices.status !== 0) throw new Error('simctl list failed');
  const runtime = Object.entries(JSON.parse(devices.stdout).devices).find(
    ([key]) => key.includes(runtimeVersion)
  )?.[1];
  const target = runtime?.find(({ name }) => name === deviceName);
  if (target == null)
    throw new Error(`${runtimeVersion} ${deviceName} simulator is unavailable`);
  return target.udid;
}

function coldReset(udid) {
  const steps = {};
  run('xcrun', ['simctl', 'shutdown', udid], { timeoutMs: 120000 });
  steps.erase = run('xcrun', ['simctl', 'erase', udid], { timeoutMs: 180000 });
  if (steps.erase.status !== 0) throw new Error(`simctl erase failed: ${steps.erase.stderr}`);
  steps.boot = run('xcrun', ['simctl', 'boot', udid], { timeoutMs: 180000 });
  steps.bootstatus = run('xcrun', ['simctl', 'bootstatus', udid, '-b'], {
    timeoutMs: 480000,
  });
  if (steps.bootstatus.status !== 0)
    throw new Error(`simctl bootstatus failed: ${steps.bootstatus.stderr}`);
  steps.install = run('xcrun', ['simctl', 'install', udid, appPath], {
    timeoutMs: 180000,
  });
  if (steps.install.status !== 0)
    throw new Error(`simctl install failed: ${steps.install.stderr}`);
  return Object.fromEntries(
    Object.entries(steps).map(([name, result]) => [
      name,
      { status: result.status, durationMs: result.durationMs },
    ])
  );
}

function startRecording(udid, path) {
  const recorder = spawn(
    'xcrun',
    ['simctl', 'io', udid, 'recordVideo', '--codec=h264', '--force', path],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  recorder.stderr.setEncoding('utf8');
  let started = false;
  let exited = false;
  recorder.stderr.on('data', (chunk) => {
    if (chunk.includes('Recording started')) started = true;
  });
  recorder.once('close', () => {
    exited = true;
  });
  const startedAt = now();
  return {
    waitStarted: async () => {
      while (!started && !exited && now() - startedAt < 30000)
        await new Promise((resolveSleep) => setTimeout(resolveSleep, 200));
      return started;
    },
    stop: async () => {
      if (exited) return;
      recorder.kill('SIGINT');
      const deadline = now() + 20000;
      while (!exited && now() < deadline)
        await new Promise((resolveSleep) => setTimeout(resolveSleep, 200));
      if (!exited) recorder.kill('SIGKILL');
    },
  };
}

async function iteration(index, udid) {
  const iterationRoot = resolve(outRoot, `iteration-${index}`);
  const stateDir = resolve(iterationRoot, 'agent-device-state');
  mkdirSync(stateDir, { recursive: true });
  const environment = { ...process.env, AGENT_DEVICE_STATE_DIR: stateDir };
  const defaultEnvironment = { ...process.env };
  delete defaultEnvironment.AGENT_DEVICE_STATE_DIR;
  const record = { index, startedAt: iso(), udid, runtimeVersion, steps: {} };
  const commands = [];
  const ad = (commandArgs, options = {}) => {
    const result = run(agentDevice, commandArgs, {
      env: environment,
      timeoutMs: options.timeoutMs ?? 240000,
    });
    commands.push({
      at: iso(),
      args: commandArgs,
      status: result.status,
      durationMs: result.durationMs,
      stdout: result.stdout.slice(0, 4000),
      stderr: result.stderr.slice(0, 4000),
    });
    return result;
  };
  const session = (commandArgs, options) =>
    ad(
      [...commandArgs, '--platform', 'ios', '--session', sessionName, '--udid', udid],
      options
    );
  const stopDaemons = () => {
    run(agentDevice, ['daemon', 'stop'], { env: defaultEnvironment });
    run(agentDevice, ['daemon', 'stop'], { env: environment });
  };

  let recorder;
  try {
    log(`iteration ${index}: cold reset of ${udid}`);
    record.steps.coldReset = coldReset(udid);
    stopDaemons();

    log(`iteration ${index}: prepare ios-runner`);
    const prepare = session(
      ['prepare', 'ios-runner', '--timeout', '300000'],
      { timeoutMs: 360000 }
    );
    record.steps.prepare = { status: prepare.status, durationMs: prepare.durationMs };
    if (prepare.status !== 0) throw new Error(`prepare ios-runner exited ${prepare.status}`);

    // Same alert-seeding dance as the device-contract preflight: the first deep
    // link after an erase shows the URL confirmation alert.
    log(`iteration ${index}: launch and deep link`);
    const setup = [
      session(['open', bundleId, '--relaunch']),
      session(['wait', 'Scenario Lab', '30000', '--depth', '100']),
      session(['open', deepLink]),
      session(['alert', 'accept']),
      session(['open', bundleId, '--relaunch']),
      session(['wait', 'Scenario Lab', '30000', '--depth', '100']),
      session(['open', deepLink]),
      session(['wait', initialOrder, '30000', '--depth', '100']),
      session(['wait', 'Callback count: 0', '15000', '--depth', '100']),
    ];
    const setupFailure = setup.find(
      (result, position) => result.status !== 0 && position !== 3
    );
    record.steps.setup = {
      ok: setupFailure == null,
      failure: setupFailure?.stderr.slice(0, 500),
    };
    if (setupFailure != null) throw new Error(`scenario setup failed: ${setupFailure.stderr}`);

    recorder = startRecording(udid, resolve(iterationRoot, 'screen.mp4'));
    record.steps.recordingStarted = await recorder.waitStarted();

    let deliveredCount = 0;
    const gestureAttempt = (name, drag) => {
      const expected = `Callback count: ${deliveredCount + 1}`;
      const startedAt = iso();
      const gesture = session(
        [
          'gesture',
          'drag',
          drag.source,
          drag.destination,
          String(timing.sourceHoldMs),
          String(timing.moveMs),
          String(timing.destinationHoldMs),
          '--json',
        ],
        { timeoutMs: 120000 }
      );
      let gestureJson = null;
      try {
        gestureJson = JSON.parse(gesture.stdout);
      } catch {}
      const wait = session(['wait', expected, '15000', '--depth', '100']);
      const delivered = wait.status === 0;
      if (delivered) deliveredCount += 1;
      const attempt = {
        name,
        startedAt,
        gestureExit: gesture.status,
        gestureDurationMs: gesture.durationMs,
        gestureReportedOk: gestureJson?.ok ?? gestureJson?.success ?? null,
        gestureReportedDurationMs:
          gestureJson?.data?.durationMs ?? gestureJson?.durationMs ?? null,
        delivered,
        waitDurationMs: wait.durationMs,
        expected,
        gestureStderr: gesture.stderr.slice(0, 1000),
      };
      log(
        `iteration ${index}: ${name} gestureExit=${attempt.gestureExit} delivered=${delivered} (${wait.durationMs} ms)`
      );
      return attempt;
    };

    record.firstGesture = gestureAttempt('first-gesture-after-cold-boot', contractDrag);
    record.probes = {};
    record.probes.secondGesture = gestureAttempt('second-gesture-same-app-instance', followUpDrag);

    const relaunch = [
      session(['open', bundleId, '--relaunch']),
      session(['wait', 'Scenario Lab', '30000', '--depth', '100']),
      session(['open', deepLink]),
      session(['wait', initialOrder, '30000', '--depth', '100']),
    ];
    if (relaunch.every((result) => result.status === 0)) {
      deliveredCount = 0;
      record.probes.relaunchGesture = gestureAttempt('gesture-after-app-relaunch', contractDrag);
    } else {
      record.probes.relaunchGesture = { skipped: 'relaunch failed' };
    }

    const tap = session(['press', 'id="engine-fallback"']);
    // The deep-link text in the scenario header switches to engine=fallback.
    const tapWait = session(['wait', 'text', 'engine=fallback', '10000', '--depth', '100']);
    record.probes.xctestTap = {
      pressExit: tap.status,
      delivered: tapWait.status === 0,
      waitDurationMs: tapWait.durationMs,
    };
    log(`iteration ${index}: xctest tap delivered=${record.probes.xctestTap.delivered}`);
  } catch (error) {
    record.error = error.message;
    log(`iteration ${index}: ${error.message}`);
  } finally {
    if (recorder != null) await recorder.stop();
    const simulatorLog = run(
      'xcrun',
      [
        'simctl',
        'spawn',
        udid,
        'log',
        'show',
        '--last',
        '8m',
        '--style',
        'compact',
        '--predicate',
        'process == "backboardd" OR process == "SpringBoard" OR process == "ReorderableExample"',
      ],
      { timeoutMs: 120000 }
    );
    writeFileSync(
      resolve(iterationRoot, 'simulator-log.txt'),
      (simulatorLog.stdout || simulatorLog.stderr || '').slice(0, 20 * 1024 * 1024)
    );
    const hostLog = run(
      'log',
      [
        'show',
        '--last',
        '8m',
        '--style',
        'compact',
        '--predicate',
        'process == "testmanagerd" OR process == "CoreSimulatorService" OR process == "SimulatorTrampoline"',
      ],
      { timeoutMs: 120000 }
    );
    writeFileSync(
      resolve(iterationRoot, 'host-log.txt'),
      (hostLog.stdout || hostLog.stderr || '').slice(0, 20 * 1024 * 1024)
    );
    session(['close']);
    stopDaemons();
    record.finishedAt = iso();
    record.commands = commands;
    writeFileSync(
      resolve(iterationRoot, 'iteration.json'),
      `${JSON.stringify(record, null, 2)}\n`
    );
  }
  return record;
}

const udid = resolveTargetUdid();
const records = [];
for (let index = 1; index <= iterations; index += 1)
  records.push(await iteration(index, udid));

const summaryRows = records.map((record) => ({
  iteration: record.index,
  bootMs: record.steps.coldReset?.bootstatus?.durationMs ?? null,
  prepareMs: record.steps.prepare?.durationMs ?? null,
  firstGestureOk: record.firstGesture?.gestureExit === 0,
  firstDelivered: record.firstGesture?.delivered ?? null,
  secondDelivered: record.probes?.secondGesture?.delivered ?? null,
  relaunchDelivered: record.probes?.relaunchGesture?.delivered ?? null,
  xctestTapDelivered: record.probes?.xctestTap?.delivered ?? null,
  error: record.error ?? null,
}));
const reproduced = summaryRows.filter(
  (row) => row.firstGestureOk && row.firstDelivered === false
).length;
const summary = {
  runtimeVersion,
  deviceName,
  udid,
  iterations,
  reproducedLostFirstGesture: reproduced,
  rows: summaryRows,
};
writeFileSync(resolve(outRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
const table = [
  `### Cold-simulator touch reproduction (${runtimeVersion}, ${deviceName})`,
  '',
  `Reproduced (gesture ok, app saw nothing): **${reproduced}/${iterations}**`,
  '',
  '| # | boot ms | prepare ms | 1st gesture ok | 1st delivered | 2nd delivered | relaunch delivered | XCTest tap delivered | error |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...summaryRows.map(
    (row) =>
      `| ${row.iteration} | ${row.bootMs ?? ''} | ${row.prepareMs ?? ''} | ${row.firstGestureOk} | ${row.firstDelivered} | ${row.secondDelivered} | ${row.relaunchDelivered} | ${row.xctestTapDelivered} | ${row.error ?? ''} |`
  ),
  '',
].join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
