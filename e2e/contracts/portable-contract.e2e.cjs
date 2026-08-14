const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdir, writeFile } = require('node:fs/promises');
const { dirname } = require('node:path');
const { promisify } = require('node:util');
const { config: detoxRuntimeConfig } = require('detox/internals');
const pointerDrivers = require('./pointer-drivers.json');
const pointerTiming = require('./pointer-timing.json');
const scenarios = require('./scenarios.json');
const {
  observedLabelFromDetoxAttributes,
} = require('./outcome-observation.cjs');

const execFileAsync = promisify(execFile);
const configuration = detoxRuntimeConfig.configurationName;
const platform =
  configuration && configuration.startsWith('android') ? 'android' : 'ios';
const engine =
  configuration === 'ios27.fallback' || configuration === 'android.fallback'
    ? 'fallback'
    : 'auto';
const outcomes = {};

if (!configuration) throw new Error('Detox runtime configuration is required');

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const visible = (label) => element(by.label(label));
// A selector resolves to its center, but the portable action is specifically
// insertion before the named target. The upper quarter stays on the target
// while selecting its leading insertion side in every engine.
const feedbackFirstSampleMs =
  pointerTiming.sourceHoldMs +
  pointerTiming.moveBudgetMs +
  pointerTiming.settleMarginMs;

async function scenarioElement(scenario, label) {
  const publicElement = visible(label);
  try {
    await detoxExpectVisible(publicElement);
    return publicElement;
  } catch (labelError) {
    const selector = scenario.selectors.find(
      (candidate) => candidate.label === label
    );
    if (platform !== 'android' || !selector?.testID) throw labelError;
    const disambiguated = element(by.id(selector.testID));
    await detoxExpectVisible(disambiguated);
    observedLabelFromDetoxAttributes(
      await disambiguated.getAttributes(),
      label
    );
    return disambiguated;
  }
}

async function openScenario(scenario) {
  const url = scenario.deepLink.replace('${ENGINE}', engine);
  await device.launchApp({
    newInstance: true,
    url,
    launchArgs: { detoxEnableSynchronization: 0 },
  });
  const initialLabels = scenario.initial?.labels ?? ['Callback count: 0'];
  for (const label of initialLabels) {
    await waitFor(visible(label)).toBeVisible().withTimeout(15000);
  }
  return { labels: initialLabels };
}

async function captureOsScreenshot(scenarioId, name) {
  const directory =
    process.env.ISSUE39_FEEDBACK_DIR ??
    `artifacts/issue-39/feedback/${configuration}/${scenarioId}`;
  const path = `${directory}/${name}.png`;
  await mkdir(directory, { recursive: true });
  if (platform === 'ios') {
    await execFileAsync('xcrun', [
      'simctl',
      'io',
      device.id,
      'screenshot',
      path,
    ]);
  } else {
    const { stdout } = await execFileAsync(
      'adb',
      ['-s', device.id, 'exec-out', 'screencap', '-p'],
      { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 }
    );
    await writeFile(path, stdout);
  }
  return path;
}

async function runUninterruptedDrag(
  scenario,
  observeFeedback,
  onActionStarted
) {
  if (
    scenario.action.kind === 'drag' &&
    scenario.action.destinationPlacement !== 'beforeTarget'
  ) {
    throw new Error(
      `Pointer scenario ${scenario.id} must define destinationPlacement as beforeTarget`
    );
  }
  const source = await scenarioElement(scenario, scenario.action.sourceLabel);
  const target = await scenarioElement(scenario, scenario.action.targetLabel);
  const destination = pointerDrivers.default.destination;
  await detoxExpectVisible(source);
  await detoxExpectVisible(target);
  if (observeFeedback) {
    await captureOsScreenshot(scenario.id, 'baseline');
  }
  let completed = false;
  let rejected;
  const action = source
    .longPressAndDrag(
      pointerTiming.sourceHoldMs,
      0.5,
      0.5,
      target,
      destination.normalizedX,
      destination.normalizedY,
      'slow',
      scenario.action.holdDurationMs == null
        ? 2000
        : scenario.action.holdDurationMs
    )
    .catch((error) => {
      rejected = error;
    })
    .finally(() => {
      completed = true;
    });
  onActionStarted?.();

  if (observeFeedback) {
    await delay(feedbackFirstSampleMs);
    for (let sample = 0; sample < pointerTiming.sampleCount; sample += 1) {
      assert.equal(completed, false, 'drag released before feedback sampling');
      await captureOsScreenshot(scenario.id, `sample-${sample + 1}`);
      if (sample + 1 < pointerTiming.sampleCount) {
        await delay(pointerTiming.sampleIntervalMs);
      }
    }
  }

  await action;
  if (observeFeedback && rejected) throw rejected;
  return rejected;
}

async function detoxExpectVisible(target) {
  await waitFor(target).toBeVisible().withTimeout(15000);
}

function accessibilityActionForPlatform(actionName) {
  if (platform !== 'ios') return actionName;
  // UIKit exposes React Native custom actions to XCTest by their spoken
  // labels; React Native still dispatches the catalog's stable action name.
  return (
    {
      'drag-drop-drop-selected': 'Drop selected items here',
      'reorder-move-later': 'Move later',
    }[actionName] ?? actionName
  );
}

async function runIndependentIosSystemAction(...args) {
  await execFileAsync('yarn', [
    'agent-device',
    ...args,
    '--session',
    'issue39-detox-interruption',
    '--udid',
    device.id,
  ]);
}

async function prepareIndependentIosSystemSession() {
  await execFileAsync('yarn', [
    'agent-device',
    'open',
    'reorderable.example',
    '--platform',
    'ios',
    '--session',
    'issue39-detox-interruption',
    '--udid',
    device.id,
  ]);
}

async function interruptActiveDrag(scenario) {
  const usesIndependentIosSession =
    platform === 'ios' &&
    (scenario.action.interrupt === 'rotate' ||
      scenario.action.interrupt === 'inactive');
  if (usesIndependentIosSession) {
    await prepareIndependentIosSystemSession();
  }
  let markActionStarted;
  const actionStarted = new Promise((resolve) => {
    markActionStarted = resolve;
  });
  const drag = runUninterruptedDrag(scenario, false, markActionStarted);
  await actionStarted;
  await delay(900);
  switch (scenario.action.interrupt) {
    case 'back':
      if (platform === 'android') {
        await execFileAsync('adb', [
          '-s',
          device.id,
          'shell',
          'input',
          'keyevent',
          '4',
        ]);
      } else {
        await device.pressBack();
      }
      break;
    case 'notification':
      await execFileAsync('adb', [
        '-s',
        device.id,
        'shell',
        'cmd',
        'statusbar',
        'expand-notifications',
      ]);
      break;
    case 'rotate':
      if (platform === 'ios')
        await runIndependentIosSystemAction('orientation', 'landscape-left');
      else {
        await execFileAsync('adb', [
          '-s',
          device.id,
          'shell',
          'settings',
          'put',
          'system',
          'accelerometer_rotation',
          '0',
        ]);
        await execFileAsync('adb', [
          '-s',
          device.id,
          'shell',
          'settings',
          'put',
          'system',
          'user_rotation',
          '1',
        ]);
      }
      break;
    case 'inactive':
      if (platform === 'android') {
        await execFileAsync('adb', [
          '-s',
          device.id,
          'shell',
          'input',
          'keyevent',
          '3',
        ]);
      } else {
        await runIndependentIosSystemAction('home');
      }
      break;
    case 'background':
      if (platform === 'android') {
        await execFileAsync('adb', [
          '-s',
          device.id,
          'shell',
          'input',
          'keyevent',
          '3',
        ]);
      } else {
        // Detox serializes its own commands while the drag is pending. Opening a
        // system URL through simctl is an independent OS input and genuinely
        // backgrounds the app without adding a product-only test control.
        await execFileAsync('xcrun', [
          'simctl',
          'openurl',
          device.id,
          'https://example.com',
        ]);
      }
      break;
    default:
      throw new Error(`Unknown interruption: ${scenario.action.interrupt}`);
  }
  if (usesIndependentIosSession) {
    await runIndependentIosSystemAction('close');
  }
  await drag;
  if (platform === 'android' && scenario.action.interrupt === 'notification') {
    await execFileAsync('adb', [
      '-s',
      device.id,
      'shell',
      'cmd',
      'statusbar',
      'collapse',
    ]);
    await device.launchApp({ newInstance: false });
  }
  if (
    scenario.action.interrupt === 'inactive' ||
    scenario.action.interrupt === 'background' ||
    (scenario.action.interrupt === 'rotate' && platform === 'android')
  ) {
    if (platform === 'android' && scenario.action.interrupt === 'rotate') {
      await execFileAsync('adb', [
        '-s',
        device.id,
        'shell',
        'settings',
        'put',
        'system',
        'user_rotation',
        '0',
      ]);
    }
    await device.launchApp({ newInstance: false });
  }
}

async function assertOutcome(scenario) {
  const expectedLabels = scenario.expected.labels ?? [
    `Current selection: ${scenario.expected.selection}`,
    `Callback count: ${scenario.expected.callbackCount}`,
  ];
  const observedLabels = [];
  for (const label of expectedLabels) {
    const observedElement = visible(label);
    await waitFor(observedElement).toBeVisible().withTimeout(15000);
    observedLabels.push(
      observedLabelFromDetoxAttributes(
        await observedElement.getAttributes(),
        label
      )
    );
  }
  if (scenario.expected.visible) {
    await waitFor(visible(scenario.expected.visible))
      .toBeVisible()
      .withTimeout(10000);
  }
  return { labels: observedLabels };
}

describe(`portable contract: ${configuration}`, () => {
  for (const scenario of scenarios.filter(({ platforms }) =>
    platforms.includes(platform)
  )) {
    it(scenario.id, async () => {
      await openScenario(scenario);
      switch (scenario.action.kind) {
        case 'drag':
          await runUninterruptedDrag(
            scenario,
            process.env.ISSUE39_ACTION_SMOKE !== '1'
          );
          break;
        case 'cancelOutside':
        case 'timedCancellation':
          await runUninterruptedDrag(scenario, false);
          break;
        case 'interrupt':
          await interruptActiveDrag(scenario);
          break;
        case 'accessibilityAction':
          await (
            await scenarioElement(scenario, scenario.action.sourceLabel)
          ).performAccessibilityAction(
            accessibilityActionForPlatform(scenario.action.actionName)
          );
          break;
        default:
          throw new Error(`Unknown action kind: ${scenario.action.kind}`);
      }
      outcomes[scenario.id] = await assertOutcome(scenario);
      await device.takeScreenshot(`${scenario.id}-${configuration}`);
    });
  }

  afterAll(async () => {
    const outputPath =
      process.env.ISSUE39_OUTCOME_FILE ??
      `artifacts/issue-39/outcomes/${configuration}.json`;
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify({ configuration, engine, platform, outcomes }, null, 2)}\n`
    );
  });
});
