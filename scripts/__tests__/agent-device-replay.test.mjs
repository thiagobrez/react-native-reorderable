import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const timing = JSON.parse(
  readFileSync(
    new URL('../../e2e/contracts/pointer-timing.json', import.meta.url),
    'utf8'
  )
);
const { agentDeviceReplayScript } = require(
  fileURLToPath(
    new URL('../../e2e/contracts/outcome-observation.cjs', import.meta.url)
  )
);

test('the iOS runner drains before held-pointer timing begins', () => {
  assert.ok(timing.preGestureSettleMs >= 5000);
  const replay = agentDeviceReplayScript({
    acceptDeepLinkPrompt: false,
    baselinePath: '/tmp/baseline.png',
    deepLink: 'reorderable://lab/free-form?engine=auto',
    destinationSelector: 'id="card-card-3"',
    expectedLabels: ['Callback count: 1'],
    gestureMarkerPath: '/tmp/gesture-start.png',
    initialLabels: ['Callback count: 0'],
    platform: 'ios',
    sourceSelector: 'id="card-card-0"',
    terminalPath: '/tmp/terminal.png',
    timing,
  });

  assert.match(
    replay,
    /wait 6000\nscreenshot "\/tmp\/gesture-start\.png"\ngesture drag/
  );
});
