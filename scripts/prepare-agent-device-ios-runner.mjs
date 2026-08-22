import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const configuration = process.argv[2];
if (configuration == null || !configuration.startsWith('ios'))
  throw new Error(
    'Usage: node scripts/prepare-agent-device-ios-runner.mjs <ios-configuration>'
  );

const runtimeVersion = configuration.startsWith('ios26')
  ? 'iOS-26-5'
  : 'iOS-27-0';
const devicesResult = spawnSync(
  'xcrun',
  ['simctl', 'list', 'devices', 'available', '-j'],
  { encoding: 'utf8' }
);
if (devicesResult.status !== 0)
  throw new Error('Failed to list available iOS simulators');
const devices = JSON.parse(devicesResult.stdout);
const runtime = Object.entries(devices.devices).find(([key]) =>
  key.includes(runtimeVersion)
)?.[1];
const target = runtime?.find(({ name }) => name === 'iPhone 17 Pro');
if (target == null)
  throw new Error(`${runtimeVersion} iPhone 17 Pro simulator is unavailable`);

const run = (command, args, options = {}) =>
  spawnSync(command, args, { stdio: 'inherit', ...options });
run('xcrun', ['simctl', 'boot', target.udid], { stdio: 'ignore' });
const bootResult = run('xcrun', ['simctl', 'bootstatus', target.udid, '-b']);
if (bootResult.status !== 0)
  throw new Error(`Failed to boot iOS simulator ${target.udid}`);
const installResult = run('xcrun', [
  'simctl',
  'install',
  target.udid,
  'example/ios/build/Build/Products/Release-iphonesimulator/ReorderableExample.app',
]);
if (installResult.status !== 0)
  throw new Error('Failed to install the Scenario Lab before runner preflight');

const agentDevice = resolve('node_modules/.bin/agent-device');
const sessionName = 'issue39-ios-runner-preflight';
const stateRoot = resolve(
  'artifacts/issue-39/agent-device',
  configuration,
  'replay-daemon-state'
);
const environment = {
  ...process.env,
  AGENT_DEVICE_STATE_DIR: stateRoot,
};
const runAgentDevice = (...args) =>
  run(agentDevice, args, { env: environment });
const defaultEnvironment = { ...process.env };
delete defaultEnvironment.AGENT_DEVICE_STATE_DIR;
const stopDefaultDaemon = () => {
  if (process.env.CI !== 'true') return;
  run(agentDevice, ['daemon', 'stop'], { env: defaultEnvironment });
};

stopDefaultDaemon();
runAgentDevice('daemon', 'stop');
let prepared = false;
try {
  const prepareResult = runAgentDevice(
    'prepare',
    'ios-runner',
    '--platform',
    'ios',
    '--session',
    sessionName,
    '--udid',
    target.udid,
    '--timeout',
    '300000'
  );
  if (prepareResult.status !== 0)
    throw new Error(
      `Agent Device iOS runner preflight exited ${prepareResult.status ?? prepareResult.signal}`
    );
  prepared = true;
} finally {
  if (!prepared) runAgentDevice('daemon', 'stop');
  stopDefaultDaemon();
}
