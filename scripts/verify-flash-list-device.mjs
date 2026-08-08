import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  options.set(process.argv[index], process.argv[index + 1]);
}

const platform = options.get('--platform');
const device = options.get('--device');
const engine = options.get('--engine') ?? 'auto';
const session =
  options.get('--session') ?? `flash-provider-${platform}-${engine}`;
const artifactDirectory = resolve(
  options.get('--artifacts') ?? `artifacts/issue-36/matrix/${session}`
);
mkdirSync(artifactDirectory, { recursive: true });

if (!['android', 'ios'].includes(platform ?? '') || device == null)
  throw new Error(
    'Usage: verify-flash-list-device.mjs --platform ios|android --device <id|name> [--engine auto|fallback] [--session <name>]'
  );
if (!['auto', 'fallback'].includes(engine))
  throw new Error('--engine must be auto or fallback');

function run(...args) {
  return execFileSync('agent-device', [...args, '--session', session], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function press(testId) {
  run('press', `id="${testId}"`, '--settle');
}

function getText(testId) {
  return run('get', 'text', `id="${testId}"`).trim();
}

function expectText(testId, expected) {
  const actual = getText(testId);
  if (!actual.includes(expected))
    throw new Error(
      `${testId}: expected ${JSON.stringify(expected)} in ${actual}`
    );
}

function expectWindowed() {
  const actual = getText('flash-mounted-count');
  const match = /Mounted rows:\s*(\d+)\s*\/\s*120/.exec(actual);
  if (match == null || Number(match[1]) <= 0 || Number(match[1]) >= 120)
    throw new Error(`Flash provider is not windowed: ${actual}`);
  return Number(match[1]);
}

function longPressSelectedAtViewportEdge(testIds, durationMs) {
  const snapshot = JSON.parse(run('snapshot', '-i', '--json', '--force-full'));
  const nodes = snapshot.data.nodes;
  const viewport = nodes.find((node) => node.type.endsWith('ScrollView'));
  const viewportBottom = viewport?.rect
    ? viewport.rect.y + viewport.rect.height
    : 0;
  const row = nodes
    .filter(
      (node) =>
        testIds.includes(node.identifier) &&
        node.rect != null &&
        node.rect.y < viewportBottom &&
        node.rect.y + node.rect.height > viewport.rect.y
    )
    .sort((left, right) => right.rect.y - left.rect.y)[0];
  if (row?.rect == null || viewport?.rect == null)
    throw new Error(
      `Could not resolve a visible selected row (${testIds.join(', ')}) and its viewport bounds`
    );
  const x = Math.round(row.rect.x + row.rect.width / 2);
  const y = Math.round(
    Math.max(
      row.rect.y + 4,
      Math.min(
        row.rect.y + row.rect.height - 4,
        viewport.rect.y + viewport.rect.height - 8
      )
    )
  );
  run('longpress', String(x), String(y), String(durationMs));
}

try {
  run(
    'open',
    'reorderable.example',
    '--platform',
    platform,
    '--device',
    device,
    '--metro-port',
    '8081',
    '--relaunch'
  );
  run('wait', 'id="engine-auto"', '45000');
  expectText('engine-auto', 'Auto');
  press(engine === 'fallback' ? 'engine-fallback' : 'engine-auto');
  press('demo-flash');
  const initialMounted = expectWindowed();
  expectText('flash-reorder-callback-count', 'Reorder callbacks: 0');
  run('screenshot', resolve(artifactDirectory, 'list.png'));

  press('flash-selection-toggle');
  expectText('flash-selection', 'flash-7, flash-9');
  if (platform === 'android')
    run('longpress', 'id="reorderable-list-wrapper-flash-9"', '6500');
  else
    longPressSelectedAtViewportEdge(
      ['reorderable-list-wrapper-flash-7', 'reorderable-list-wrapper-flash-9'],
      6500
    );
  expectText('flash-reorder-callback-count', 'Reorder callbacks: 1');
  expectText('flash-last-reorder-event', '"sourceIds":["flash-7","flash-9"]');
  const committedEvent = getText('flash-last-reorder-event');
  const destinationIndex = Number(
    /"beforeId":"flash-(\d+)"/.exec(committedEvent)?.[1] ?? -1
  );
  if (destinationIndex < 10)
    throw new Error(
      `Edge auto-scroll did not advance the destination: ${committedEvent}`
    );
  expectWindowed();

  press('flash-reset');
  expectText('flash-reorder-callback-count', 'Reorder callbacks: 0');
  press('flash-mode-sections');
  expectWindowed();
  run('wait', 'Empty start', '5000');
  press('flash-cancel-next-hold');
  expectText('flash-cancel-next-hold', 'Armed');
  run('longpress', 'id="reorderable-section-list-wrapper-flash-1"', '6500');
  expectText('flash-cancel-toggle', 'Enable');
  expectText('flash-reorder-callback-count', 'Reorder callbacks: 0');
  if (platform === 'ios') {
    run('scroll', 'bottom');
    run('wait', 'Empty end footer', '5000');
  } else {
    run('scroll', 'down');
    expectWindowed();
  }
  run('screenshot', resolve(artifactDirectory, 'sections-bottom.png'));
  run('screenshot', resolve(artifactDirectory, 'disabled.png'));
  process.stdout.write(
    `PASS platform=${platform} device=${device} engine=${engine} mounted=${initialMounted}/120 sourceIds=flash-7,flash-9 destination=beforeId:flash-${destinationIndex} cancellationCallbacks=0 artifacts=${artifactDirectory}\n`
  );
} finally {
  try {
    run('close');
  } catch {
    // Preserve the primary assertion failure if startup never established a session.
  }
}
