import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const options = new Map();
for (let index = 2; index < process.argv.length; index += 2)
  options.set(process.argv[index], process.argv[index + 1]);

const platform = options.get('--platform');
const device = options.get('--device');
const scenario = options.get('--scenario');
const engine = options.get('--engine') ?? 'auto';
const session = options.get('--session') ?? `issue-38-${platform}-${scenario}`;
const artifactDirectory = resolve(
  options.get('--artifacts') ?? `artifacts/issue-38/matrix/${session}`
);

const scenarioAreas = new Map([
  ...[
    'free-form',
    'virtualized-list',
    'section-list',
    'multi-selection',
    'cross-panel-drop',
  ].map((id) => [id, 'examples']),
  ...[
    'controlled-order',
    'exact-10000',
    'variable-1000',
    'sections-24x25',
    'autoscroll-200',
    'selection',
    'drop-zones',
    'cancellation',
    'accessibility',
  ].map((id) => [id, 'lab']),
  ...[
    'flash-list',
    'flash-section-list',
    'legend-list',
    'legend-section-list',
  ].map((id) => [id, 'integrations']),
]);

if (
  !['ios', 'android'].includes(platform ?? '') ||
  device == null ||
  !scenarioAreas.has(scenario)
)
  throw new Error(
    'Usage: verify-named-scenario-device.mjs --platform ios|android --device <id|name> --scenario <visible-scenario> [--engine auto|fallback]'
  );
if (!['auto', 'fallback'].includes(engine))
  throw new Error('--engine must be auto or fallback');

mkdirSync(artifactDirectory, { recursive: true });
const area = scenarioAreas.get(scenario);

function run(...args) {
  return execFileSync('agent-device', [...args, '--session', session], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function text(id) {
  return run('get', 'text', `id="${id}"`).trim();
}

function expectIncludes(id, expected) {
  const actual = text(id);
  if (!actual.includes(expected))
    throw new Error(`${id}: expected ${JSON.stringify(expected)} in ${actual}`);
}

try {
  run(
    'open',
    'reorderable.example',
    '--platform',
    platform,
    '--device',
    device,
    '--metro-host',
    '127.0.0.1',
    '--metro-port',
    '8081',
    '--relaunch'
  );
  run('wait', 'id="area-examples"', '45000');
  run('press', `id="area-tab-${area}"`, '--settle');
  if (scenario === 'cancellation' || scenario === 'accessibility')
    run('scroll', 'down', '3');
  run('press', `id="open-${scenario}"`, '--settle');
  run('wait', `id="scenario-${scenario}"`, '15000');

  if (area === 'lab') run('press', `id="engine-${engine}"`, '--settle');

  expectIncludes(`scenario-${scenario}-order`, 'Order:');
  expectIncludes(`scenario-${scenario}-selection`, 'Selection:');
  expectIncludes(`scenario-${scenario}-last-event`, 'Last committed event:');
  expectIncludes(`scenario-${scenario}-callback-count`, 'Callback count: 0');
  expectIncludes(
    `scenario-${scenario}-deep-link`,
    `reorderable://${area}/${scenario}?preset=`
  );
  run('press', `id="scenario-${scenario}-reset"`, '--settle');
  expectIncludes(`scenario-${scenario}-callback-count`, 'Callback count: 0');
  run('screenshot', resolve(artifactDirectory, `${scenario}-${engine}.png`));

  if (scenario === 'autoscroll-200' && platform === 'android') {
    run('longpress', 'id="row-autoscroll-10"', '6500', '--settle');
    expectIncludes(
      'scenario-autoscroll-200-callback-count',
      'Callback count: 1'
    );
    expectIncludes(
      'scenario-autoscroll-200-last-event',
      '"sourceIds":["autoscroll-10"]'
    );
    run('screenshot', resolve(artifactDirectory, 'autoscroll-committed.png'));
  }

  if (scenario === 'cancellation') {
    run('press', 'id="cancellation-arm-disable"', '--settle');
    run('longpress', 'id="cancellation-blue"', '6500', '--settle');
    expectIncludes('scenario-cancellation-callback-count', 'Callback count: 0');
    expectIncludes('cancellation-disable', 'Enable container');
    run('screenshot', resolve(artifactDirectory, 'cancelled-by-disable.png'));

    run('press', 'id="scenario-cancellation-reset"', '--settle');
    run('press', 'id="cancellation-arm-unmount"', '--settle');
    run('longpress', 'id="cancellation-blue"', '6500', '--settle');
    run('wait', 'id="cancellation-unmounted"', '5000');
    expectIncludes('scenario-cancellation-callback-count', 'Callback count: 0');
    run('screenshot', resolve(artifactDirectory, 'cancelled-by-unmount.png'));
  }

  process.stdout.write(
    `PASS area=${area} scenario=${scenario} platform=${platform} engine=${area === 'lab' ? engine : 'auto'} artifacts=${artifactDirectory}\n`
  );
} finally {
  try {
    run('close');
  } catch {
    /* preserve the primary failure */
  }
}
