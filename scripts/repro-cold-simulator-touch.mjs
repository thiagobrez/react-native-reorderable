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
// A synthesized drag whose touch stream reaches the app only after this many
// milliseconds is counted as late delivery. 3 s is well beyond a healthy commit
// (sub-second in warm runs) and below the 15 s wait window, so it separates the
// defect's late tail from ordinary jitter.
const LATE_DELIVERY_THRESHOLD_MS = 3000;

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
    // `alert accept` can hit RUNNER_BUSY right after the deep link on a slow
    // host; retry it, because an unaccepted URL confirmation blocks the scenario.
    const acceptAlert = () => {
      let result;
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        result = session(['alert', 'accept']);
        if (result.status === 0 || !result.stderr.includes('RUNNER_BUSY')) break;
        spawnSync('sleep', ['3']);
      }
      return result;
    };
    // Bring the scenario to its start state. A cold hosted host can hiccup on an
    // individual `open`/`wait` (xcrun timeout, unrendered deep link) that a
    // relaunch clears; retry the whole approach a few times so a transient setup
    // hiccup does not burn an iteration that would otherwise measure the gesture.
    const runSetup = () => {
      const steps = [
        session(['open', bundleId, '--relaunch']),
        session(['wait', 'Scenario Lab', '30000', '--depth', '100']),
        session(['open', deepLink]),
        acceptAlert(),
        session(['open', bundleId, '--relaunch']),
        session(['wait', 'Scenario Lab', '30000', '--depth', '100']),
        session(['open', deepLink]),
        session(['wait', initialOrder, '30000', '--depth', '100']),
        session(['wait', 'Callback count: 0', '15000', '--depth', '100']),
      ];
      // Index 3 is the alert accept, absent when no confirmation is pending.
      return steps.find((result, position) => result.status !== 0 && position !== 3);
    };
    let setupFailure = runSetup();
    for (let attempt = 2; attempt <= 3 && setupFailure != null; attempt += 1) {
      log(`iteration ${index}: scenario setup retry ${attempt}`);
      setupFailure = runSetup();
    }
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
      // The defect being reproduced: the gesture command reports ok while the
      // app's touch stream arrives late or never. Classify by what the app saw,
      // not by the gesture command's exit code.
      //   lost   the gesture reported ok but the app never observed the effect
      //   late   the app observed it, but only after LATE_DELIVERY_THRESHOLD_MS
      //   prompt the app observed it promptly (healthy)
      //   errored the gesture command itself failed (not the defect)
      const gestureReportedOk = gestureJson?.ok ?? gestureJson?.success ?? null;
      const deliveryClass =
        gesture.status !== 0 && gestureReportedOk !== true
          ? delivered
            ? 'late'
            : 'errored'
          : delivered
            ? wait.durationMs > LATE_DELIVERY_THRESHOLD_MS
              ? 'late'
              : 'prompt'
            : 'lost';
      const attempt = {
        name,
        startedAt,
        gestureExit: gesture.status,
        gestureDurationMs: gesture.durationMs,
        gestureReportedOk,
        gestureReportedDurationMs:
          gestureJson?.data?.durationMs ?? gestureJson?.durationMs ?? null,
        delivered,
        deliveryClass,
        waitDurationMs: wait.durationMs,
        expected,
        gestureStderr: gesture.stderr.slice(0, 1000),
      };
      log(
        `iteration ${index}: ${name} class=${deliveryClass} reportedOk=${gestureReportedOk} appDelivered=${delivered} (${wait.durationMs} ms)`
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
  firstClass: record.firstGesture?.deliveryClass ?? null,
  firstWaitMs: record.firstGesture?.waitDurationMs ?? null,
  secondClass: record.probes?.secondGesture?.deliveryClass ?? null,
  relaunchClass: record.probes?.relaunchGesture?.deliveryClass ?? null,
  // The discriminator: the public XCTest coordinate tap on the same runner,
  // right after the synthesized gesture. It landing while the gesture is lost
  // is what points at the private synthesized-event path rather than a
  // simulator-wide input stall.
  xctestTapDelivered: record.probes?.xctestTap?.delivered ?? null,
  error: record.error ?? null,
}));
// Every measured synthesized-gesture wait across the run (first, second,
// relaunch), for the delivery-latency distribution.
const gestureWaits = records
  .flatMap((record) => [
    record.firstGesture,
    record.probes?.secondGesture,
    record.probes?.relaunchGesture,
  ])
  .filter((attempt) => attempt != null && typeof attempt.waitDurationMs === 'number')
  .map((attempt) => attempt.waitDurationMs)
  .sort((a, b) => a - b);
const percentile = (values, fraction) =>
  values.length === 0
    ? null
    : values[Math.min(values.length - 1, Math.floor(values.length * fraction))];
const gesturesMeasured = summaryRows.filter((row) => row.firstClass != null).length;
const lost = summaryRows.filter((row) => row.firstClass === 'lost').length;
const late = summaryRows.filter((row) => row.firstClass === 'late').length;
// The defect is reproduced whenever the first synthesized gesture into a cold
// simulator was lost or arrived late while the gesture command reported ok.
const reproduced = lost + late;
const summary = {
  runtimeVersion,
  deviceName,
  udid,
  iterations,
  gesturesMeasured,
  firstGestureLost: lost,
  firstGestureLate: late,
  reproduced,
  deliveryLatencyMs: {
    count: gestureWaits.length,
    min: gestureWaits[0] ?? null,
    median: percentile(gestureWaits, 0.5),
    p90: percentile(gestureWaits, 0.9),
    max: gestureWaits[gestureWaits.length - 1] ?? null,
  },
  rows: summaryRows,
};
writeFileSync(resolve(outRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
const latency = summary.deliveryLatencyMs;
const table = [
  `### Cold-simulator touch reproduction (${runtimeVersion}, ${deviceName})`,
  '',
  `First synthesized gesture lost or late (reported ok, app saw it late or never): **${reproduced}/${gesturesMeasured}** measured iterations (lost ${lost}, late ${late}).`,
  '',
  `Delivery latency across ${latency.count} synthesized gestures: min ${latency.min} ms, median ${latency.median} ms, p90 ${latency.p90} ms, max ${latency.max} ms.`,
  '',
  '| # | boot ms | prepare ms | 1st gesture | 1st wait ms | 2nd gesture | relaunch gesture | XCTest tap delivered | error |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...summaryRows.map(
    (row) =>
      `| ${row.iteration} | ${row.bootMs ?? ''} | ${row.prepareMs ?? ''} | ${row.firstClass ?? ''} | ${row.firstWaitMs ?? ''} | ${row.secondClass ?? ''} | ${row.relaunchClass ?? ''} | ${row.xctestTapDelivered} | ${row.error ? row.error.split('\n')[0].slice(0, 80) : ''} |`
  ),
  '',
].join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
