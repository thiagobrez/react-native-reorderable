import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const options = new Map();
for (let index = 2; index < process.argv.length; index += 2)
  options.set(process.argv[index], process.argv[index + 1]);

const platform = options.get('--platform');
const device = options.get('--device');
const engine = options.get('--engine') ?? 'auto';
const session =
  options.get('--session') ?? `legend-provider-${platform}-${engine}`;
const artifactDirectory = resolve(
  options.get('--artifacts') ?? `artifacts/issue-37/matrix/${session}`
);
mkdirSync(artifactDirectory, { recursive: true });

if (!['android', 'ios'].includes(platform ?? '') || device == null)
  throw new Error(
    'Usage: verify-legend-list-device.mjs --platform ios|android --device <id|name> [--engine auto|fallback] [--session <name>]'
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
  const actual = getText('legend-mounted-count');
  const match = /Mounted rows:\s*(\d+)\s*\/\s*120/.exec(actual);
  if (match == null || Number(match[1]) <= 0 || Number(match[1]) >= 120)
    throw new Error(`Legend provider is not windowed: ${actual}`);
  return Number(match[1]);
}

function expectPeakWindowed() {
  const actual = getText('legend-mounted-count');
  const match = /peak:\s*(\d+)\s*\/\s*120/.exec(actual);
  if (match == null || Number(match[1]) <= 0 || Number(match[1]) > 60)
    throw new Error(`Legend provider exceeded the peak window bound: ${actual}`);
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
        viewport?.rect != null &&
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
  press(engine === 'fallback' ? 'engine-fallback' : 'engine-auto');
  press('demo-legend');
  const initialMounted = expectWindowed();
  expectText('legend-reorder-callback-count', 'Reorder callbacks: 0');
  run('screenshot', resolve(artifactDirectory, 'list.png'));

  press('legend-selection-toggle');
  expectText('legend-selection', 'legend-7, legend-9');
  if (platform === 'android')
    run('longpress', 'id="reorderable-list-wrapper-legend-9"', '6500');
  else
    longPressSelectedAtViewportEdge(
      [
        'reorderable-list-wrapper-legend-7',
        'reorderable-list-wrapper-legend-9',
      ],
      6500
    );
  expectText('legend-reorder-callback-count', 'Reorder callbacks: 1');
  expectText(
    'legend-last-reorder-event',
    '"sourceIds":["legend-7","legend-9"]'
  );
  const committedEvent = getText('legend-last-reorder-event');
  const destinationIndex = Number(
    /"beforeId":"legend-(\d+)"/.exec(committedEvent)?.[1] ?? -1
  );
  if (destinationIndex < 10)
    throw new Error(
      `Edge auto-scroll did not advance the destination: ${committedEvent}`
    );
  expectWindowed();
  const peakMounted = expectPeakWindowed();

  press('legend-reset');
  press('legend-mode-sections');
  expectWindowed();
  run('wait', 'Empty start', '5000');
  press('legend-cancel-next-hold');
  expectText('legend-cancel-next-hold', 'Armed');
  run('longpress', 'id="reorderable-section-list-wrapper-legend-1"', '6500');
  expectText('legend-cancel-toggle', 'Enable');
  expectText('legend-reorder-callback-count', 'Reorder callbacks: 0');
  press('legend-sections-bottom');
  // Legend corrects its adaptive estimate after materializing the last rows;
  // a second public ref jump fixes the viewport to the newly measured end.
  press('legend-sections-bottom');
  run('wait', 'Empty end footer', '5000');
  expectWindowed();
  run('screenshot', resolve(artifactDirectory, 'sections-bottom.png'));
  run('screenshot', resolve(artifactDirectory, 'disabled.png'));
  process.stdout.write(
    `PASS platform=${platform} device=${device} engine=${engine} mounted=${initialMounted}/120 peakMounted=${peakMounted}/120 sourceIds=legend-7,legend-9 destination=beforeId:legend-${destinationIndex} cancellationCallbacks=0 artifacts=${artifactDirectory}\n`
  );
} finally {
  try {
    run('close');
  } catch {
    // Preserve the primary assertion failure if startup never established a session.
  }
}
