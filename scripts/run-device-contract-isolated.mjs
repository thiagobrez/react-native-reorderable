import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const configuration = process.argv[2];
if (configuration == null)
  throw new Error(
    'Usage: node scripts/run-device-contract-isolated.mjs <configuration>'
  );

const platform = configuration.startsWith('android') ? 'android' : 'ios';
const attempt = process.env.ISSUE39_MATRIX_ATTEMPT;
const attemptSegments = attempt == null ? [] : ['attempts', attempt];
const scenarios = JSON.parse(
  readFileSync(resolve('e2e/contracts/scenarios.json'), 'utf8')
);
const pointerDrivers = JSON.parse(
  readFileSync(resolve('e2e/contracts/pointer-drivers.json'), 'utf8')
);
const applicable = scenarios.filter(({ platforms }) =>
  platforms.includes(platform)
);
const artifactRoot = resolve(
  'artifacts/issue-39/detox',
  configuration,
  ...attemptSegments,
  'isolated'
);
const caseOutcomeRoot = resolve(
  'artifacts/issue-39/outcomes-by-case',
  configuration,
  ...attemptSegments
);
const feedbackRoot = resolve(
  'artifacts/issue-39/feedback',
  configuration,
  ...attemptSegments
);
const agentDeviceRoot = resolve(
  'artifacts/issue-39/agent-device',
  configuration,
  ...attemptSegments
);
const replayStateRoot = resolve(
  'artifacts/issue-39/agent-device',
  configuration,
  ...attemptSegments,
  'replay-daemon-state'
);
const stopReplayDaemon = () =>
  spawnSync(resolve('node_modules/.bin/agent-device'), ['daemon', 'stop'], {
    env: {
      ...process.env,
      AGENT_DEVICE_STATE_DIR: replayStateRoot,
    },
    stdio: 'inherit',
  });
const hasObservedScenarioOutcome = (outcomeFile, scenarioId) => {
  if (!existsSync(outcomeFile)) return false;
  try {
    const report = JSON.parse(readFileSync(outcomeFile, 'utf8'));
    return Object.hasOwn(report.outcomes ?? {}, scenarioId);
  } catch {
    return false;
  }
};
const table = [];
const outcomes = {};
let agentDevicePrepared = false;
const agentDeviceProcessTimeoutMs = 240000;
// Detox's own 180-second test timeout still enforces the contract. This outer
// timeout also has to cover a freshly erased simulator's boot and Detox
// teardown, which can take more than four minutes on hosted iOS runners.
const detoxProcessTimeoutMs = 360000;
const detoxPortBlockSize = 20;
if (applicable.length > detoxPortBlockSize)
  throw new Error(
    `At most ${detoxPortBlockSize} isolated scenarios are supported`
  );
const detoxPortBase =
  20000 + (Math.abs(process.pid) % 1000) * detoxPortBlockSize;
const detoxServerUrlForCase = (scenarioIndex) =>
  `ws://127.0.0.1:${detoxPortBase + scenarioIndex}`;

mkdirSync(artifactRoot, { recursive: true });
mkdirSync(caseOutcomeRoot, { recursive: true });

for (const [scenarioIndex, scenario] of applicable.entries()) {
  const driver = pointerDrivers.routes?.[configuration]?.[scenario.id];
  if (driver === 'agent-device' && !agentDevicePrepared) {
    if (platform === 'ios') {
      const preflight = spawnSync(
        process.execPath,
        ['scripts/prepare-agent-device-ios-runner.mjs', configuration],
        { stdio: 'inherit', timeout: 600000 }
      );
      if (preflight.status !== 0) process.exit(75);
    }
    agentDevicePrepared = true;
  }
  if (driver !== 'agent-device' && agentDevicePrepared) {
    stopReplayDaemon();
    agentDevicePrepared = false;
  }

  if (platform === 'android') {
    spawnSync(
      'adb',
      ['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0'],
      { stdio: 'inherit' }
    );
    spawnSync(
      'adb',
      ['shell', 'settings', 'put', 'system', 'user_rotation', '0'],
      { stdio: 'inherit' }
    );
    spawnSync('adb', ['shell', 'cmd', 'statusbar', 'collapse'], {
      stdio: 'inherit',
    });
  }

  const outcomeFile = resolve(caseOutcomeRoot, `${scenario.id}.json`);
  const startedAt = Date.now();
  const result =
    driver === 'agent-device'
      ? spawnSync(
          'node',
          [
            'scripts/run-agent-device-pointer.mjs',
            configuration,
            scenario.id,
            outcomeFile,
          ],
          {
            env: {
              ...process.env,
              ISSUE39_AGENT_DEVICE_DIR: resolve(agentDeviceRoot, scenario.id),
              ISSUE39_FEEDBACK_DIR: resolve(feedbackRoot, scenario.id),
            },
            stdio: 'inherit',
            timeout: agentDeviceProcessTimeoutMs,
          }
        )
      : spawnSync(
          'yarn',
          [
            'detox',
            'test',
            '--configuration',
            configuration,
            '--testNamePattern',
            `${scenario.id}$`,
            '--record-logs',
            'all',
            '--record-videos',
            'all',
            '--take-screenshots',
            'all',
            '--capture-view-hierarchy',
            'enabled',
            '--artifacts-location',
            resolve(artifactRoot, scenario.id),
          ],
          {
            env: {
              ...process.env,
              AGENT_DEVICE_STATE_DIR: replayStateRoot,
              ISSUE39_DETOX_SERVER_URL: detoxServerUrlForCase(scenarioIndex),
              ISSUE39_FEEDBACK_DIR: resolve(feedbackRoot, scenario.id),
              ISSUE39_OUTCOME_FILE: outcomeFile,
            },
            stdio: 'inherit',
            timeout: detoxProcessTimeoutMs,
          }
        );
  const passed = result.status === 0;
  // Detox writes its report from afterAll even if the action failed before
  // terminal observation. Only a scenario entry proves that either driver
  // reached and recorded the exact public contract outcome.
  const reachedContractAssertion = hasObservedScenarioOutcome(
    outcomeFile,
    scenario.id
  );
  const infrastructureFailure =
    !passed &&
    (result.status == null ||
      result.signal != null ||
      !reachedContractAssertion);
  if (driver === 'agent-device' && !passed) {
    stopReplayDaemon();
    agentDevicePrepared = false;
  }
  table.push({
    id: scenario.id,
    durationMs: Date.now() - startedAt,
    exitCode: result.status,
    signal: result.signal,
    status: passed ? 'passed' : 'failed',
    failureKind: passed
      ? null
      : infrastructureFailure
        ? 'infrastructure'
        : 'contract',
  });
  if (passed) {
    const report = JSON.parse(readFileSync(outcomeFile, 'utf8'));
    Object.assign(outcomes, report.outcomes);
  }
}

if (agentDevicePrepared) stopReplayDaemon();

const tablePath = resolve(
  'artifacts/issue-39/device-tables',
  attempt == null ? `${configuration}.json` : `${configuration}-${attempt}.json`
);
mkdirSync(dirname(tablePath), { recursive: true });
writeFileSync(
  tablePath,
  `${JSON.stringify({ configuration, platform, table }, null, 2)}\n`
);

if (table.every(({ status }) => status === 'passed')) {
  const outcomePath = resolve(
    'artifacts/issue-39/outcomes',
    attempt == null
      ? `${configuration}.json`
      : `${configuration}-${attempt}.json`
  );
  mkdirSync(dirname(outcomePath), { recursive: true });
  writeFileSync(
    outcomePath,
    `${JSON.stringify({ configuration, platform, outcomes }, null, 2)}\n`
  );
}

for (const row of table)
  process.stdout.write(
    `${row.status === 'passed' ? 'PASS' : 'FAIL'} ${configuration} ${row.id} (${row.durationMs}ms)\n`
  );

const failedRows = table.filter(({ status }) => status === 'failed');
const infrastructureFailure = failedRows.some(
  ({ failureKind }) => failureKind === 'infrastructure'
);
process.exitCode = failedRows.length === 0 ? 0 : infrastructureFailure ? 75 : 1;
