import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function regressionKey(name, metric) {
  return `${metric}:${name}`;
}

const requiredScenarios = [
  'paired plain children critical render path',
  '12-item ReorderableContainer critical render path',
  'paired plain FlatList critical render path',
  '1,000-row variable-height ReorderableList critical render path',
  'paired plain SectionList critical render path',
  '24-section ReorderableSectionList critical render path',
];

export function verifyReassureOutput(
  output,
  acceptance = { regressions: [] },
  expectedScenarios = requiredScenarios
) {
  const accepted = new Map();
  for (const entry of acceptance.regressions ?? []) {
    if (
      typeof entry?.name !== 'string' ||
      entry?.metric !== 'duration' ||
      typeof entry?.baselineCommit !== 'string' ||
      !/^[0-9a-f]{40}$/.test(entry.baselineCommit) ||
      typeof entry?.reason !== 'string' ||
      entry.reason.trim().length === 0
    ) {
      throw new Error(
        'Every accepted Reassure regression needs a name, the duration metric, a 40-character baseline commit, and a non-empty reason; render-count increases cannot be accepted.'
      );
    }
    if (entry.baselineCommit === output.metadata?.baseline?.commitHash)
      accepted.set(regressionKey(entry.name, entry.metric), entry.reason);
  }

  const failures = [];
  for (const error of output.errors ?? [])
    failures.push(`Reassure error: ${error.message ?? JSON.stringify(error)}`);
  for (const issue of output.renderIssues ?? [])
    failures.push(
      `Reassure render issue: ${issue.name ?? JSON.stringify(issue)}`
    );
  for (const entry of output.added ?? [])
    failures.push(`Reassure scenario has no baseline: ${entry.name}`);
  for (const entry of output.removed ?? [])
    failures.push(`Reassure scenario is missing from current: ${entry.name}`);

  const measuredNames = new Set(
    ['significant', 'meaningless', 'countChanged'].flatMap((group) =>
      (output[group] ?? []).map((entry) => entry.name)
    )
  );
  for (const name of expectedScenarios) {
    if (!measuredNames.has(name))
      failures.push(`Required Reassure scenario is missing: ${name}`);
  }

  for (const entry of output.countChanged ?? []) {
    const baseline = entry.baseline?.meanCount;
    const current = entry.current?.meanCount;
    if (
      typeof baseline === 'number' &&
      typeof current === 'number' &&
      current > baseline
    ) {
      failures.push(
        `${entry.name}: render count increased from ${baseline} to ${current}`
      );
    }
  }

  for (const entry of output.significant ?? []) {
    if (
      entry.isDurationDiffSignificant === true &&
      typeof entry.durationDiff === 'number' &&
      entry.durationDiff > 0 &&
      !accepted.has(regressionKey(entry.name, 'duration'))
    ) {
      failures.push(
        `${entry.name}: statistically significant slowdown of ${entry.durationDiff.toFixed(3)} ms`
      );
    }
  }
  return failures;
}

async function main() {
  const [outputPath = '.reassure/output.json', acceptancePath] =
    process.argv.slice(2);
  const resolvedAcceptancePath =
    acceptancePath ?? 'performance/reassure-accepted-regressions.json';
  const [output, acceptance] = await Promise.all([
    readFile(outputPath, 'utf8').then(JSON.parse),
    readFile(resolvedAcceptancePath, 'utf8').then(JSON.parse),
  ]);
  const failures = verifyReassureOutput(output, acceptance);
  if (failures.length > 0)
    throw new Error(
      `Reassure publication gate failed:\n- ${failures.join('\n- ')}`
    );
  process.stdout.write('Reassure publication gate passed.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
