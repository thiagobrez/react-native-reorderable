import { spawnSync } from 'node:child_process';

const configuration = process.argv[2];

function run() {
  if (configuration == null || !configuration.startsWith('ios')) {
    throw new Error(
      'Usage: node scripts/reset-device-contract-ios-simulator.mjs <ios-configuration>'
    );
  }

  const runtimeVersion = configuration.startsWith('ios26')
    ? 'iOS-26-5'
    : 'iOS-27-0';
  const devicesResult = spawnSync(
    'xcrun',
    ['simctl', 'list', 'devices', 'available', '-j'],
    { encoding: 'utf8', timeout: 120000 }
  );
  if (devicesResult.status !== 0) {
    throw new Error('Failed to list available iOS simulators before retry');
  }

  const devices = JSON.parse(devicesResult.stdout);
  const runtime = Object.entries(devices.devices).find(([key]) =>
    key.includes(runtimeVersion)
  )?.[1];
  const target = runtime?.find(({ name }) => name === 'iPhone 17 Pro');
  if (target == null) {
    throw new Error(`${runtimeVersion} iPhone 17 Pro simulator is unavailable`);
  }

  spawnSync('xcrun', ['simctl', 'shutdown', target.udid], {
    stdio: 'inherit',
    timeout: 120000,
  });
  const eraseResult = spawnSync('xcrun', ['simctl', 'erase', target.udid], {
    stdio: 'inherit',
    timeout: 120000,
  });
  if (eraseResult.status !== 0) {
    throw new Error(`Failed to erase iOS simulator ${target.udid}`);
  }
  const bootResult = spawnSync('xcrun', ['simctl', 'boot', target.udid], {
    stdio: 'inherit',
    timeout: 120000,
  });
  if (bootResult.status !== 0) {
    throw new Error(`Failed to boot iOS simulator ${target.udid}`);
  }
  const bootStatusResult = spawnSync(
    'xcrun',
    ['simctl', 'bootstatus', target.udid, '-b'],
    {
      stdio: 'inherit',
      timeout: 240000,
    }
  );
  if (bootStatusResult.status !== 0) {
    throw new Error(`iOS simulator ${target.udid} did not finish booting`);
  }
  process.stdout.write(
    `Reset and booted ${runtimeVersion} iPhone 17 Pro simulator ${target.udid}\n`
  );
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 75;
}
