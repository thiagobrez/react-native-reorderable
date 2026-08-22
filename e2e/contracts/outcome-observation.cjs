function observedLabelsFromSnapshot(snapshot, expectedLabels, bundleId) {
  if (snapshot?.success !== true || !Array.isArray(snapshot?.data?.nodes))
    throw new Error('Agent Device snapshot did not contain an accessibility tree');
  const appNodes = snapshot.data.nodes.filter(
    (node) =>
      node.visibleToUser !== false &&
      typeof node.label === 'string' &&
      (bundleId == null || node.bundleId == null || node.bundleId === bundleId)
  );
  const labels = expectedLabels.map((expected) => {
    const exactMatches = appNodes.filter(({ label }) => label === expected);
    if (exactMatches.length > 0) return exactMatches[0].label;
    const matches = appNodes.filter(({ label }) => label.includes(expected));
    if (matches.length !== 1)
      throw new Error(
        `Observed accessibility tree expected exactly one ${JSON.stringify(expected)}, found ${matches.length}`
      );
    const observedLabel = matches[0].label;
    const start = observedLabel.indexOf(expected);
    return observedLabel.slice(start, start + expected.length);
  });
  return { labels };
}

function agentDeviceReplayScript({
  acceptDeepLinkPrompt,
  baselinePath,
  deepLink,
  destinationSelector,
  expectedLabels,
  gestureMarkerPath,
  initialLabels,
  platform,
  recordingPath,
  sourceSelector,
  terminalPath,
  timing,
}) {
  const quote = (value) => `"${value.replaceAll('"', '\\"')}"`;
  const kind = platform === 'android' ? 'emulator' : 'simulator';
  return [
    `context platform=${platform} kind=${kind} timeout=60000`,
    '',
    'env APP_TARGET="reorderable.example"',
    `env DEEP_LINK=${quote(deepLink)}`,
    '',
    'open "${APP_TARGET}" --relaunch',
    'wait "Scenario Lab" 15000',
    'open "${DEEP_LINK}"',
    ...(acceptDeepLinkPrompt ? ['alert accept'] : []),
    ...initialLabels.map((label) => `wait ${quote(label)} 15000`),
    `screenshot ${quote(baselinePath)}`,
    `record start ${quote(recordingPath)} --scope device`,
    'wait 1000',
    `screenshot ${quote(gestureMarkerPath)}`,
    `gesture drag ${quote(sourceSelector)} ${quote(destinationSelector)} ${timing.sourceHoldMs} ${timing.moveBudgetMs} ${timing.destinationHoldMs}`,
    ...expectedLabels.map((label) => `wait ${quote(label)} 15000`),
    `screenshot ${quote(terminalPath)}`,
    'record stop',
    '',
  ].join('\n');
}

function observedLabelFromDetoxAttributes(attributes, expectedLabel) {
  const candidates = Array.isArray(attributes?.elements)
    ? attributes.elements
    : [attributes];
  if (candidates.length !== 1)
    throw new Error(
      `Detox observed ${candidates.length} elements for ${JSON.stringify(expectedLabel)}`
    );
  const actual = candidates[0]?.label;
  if (actual !== expectedLabel)
    throw new Error(
      `Detox observed ${JSON.stringify(actual)} instead of ${JSON.stringify(expectedLabel)}`
    );
  return actual;
}

module.exports = {
  agentDeviceReplayScript,
  observedLabelFromDetoxAttributes,
  observedLabelsFromSnapshot,
};
