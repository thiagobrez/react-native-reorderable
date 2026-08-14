import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve(
  process.argv[2] == null ? 'artifacts/issue-39/outcomes' : process.argv[2]
);
const files = readdirSync(directory)
  .filter((file) => file.endsWith('.json'))
  .sort();
const expectedConfigurations = [
  'android.fallback',
  'ios26.auto-fallback',
  'ios27.fallback',
  'ios27.native',
];
const sharedScenarios = [
  'accessible-drop',
  'accessible-reorder',
  'enabled-false',
  'free-form-reorder',
  'gesture-system-interruption',
  'invalid-outside-release',
  'multi-selection-reorder',
  'scoped-drop',
  'section-list-reorder',
  'unmount',
  'virtualized-list-reorder',
];
const iosOnlyScenarios = ['ios-background', 'ios-inactive'];
const androidOnlyScenarios = [
  'android-app-state',
  'android-back',
  'android-blur',
];
const expectedScenariosByConfiguration = new Map(
  expectedConfigurations.map((configuration) => [
    configuration,
    [
      ...sharedScenarios,
      ...(configuration.startsWith('android')
        ? androidOnlyScenarios
        : iosOnlyScenarios),
    ].sort(),
  ])
);
const reports = files.map((file) =>
  JSON.parse(readFileSync(resolve(directory, file), 'utf8'))
);

const configurations = reports.map(({ configuration }) => configuration).sort();
if (JSON.stringify(configurations) !== JSON.stringify(expectedConfigurations))
  throw new Error(
    `Expected ${expectedConfigurations.join(', ')}, received ${configurations.join(', ')}`
  );

for (const report of reports) {
  const actualScenarios = Object.keys(report.outcomes).sort();
  const expectedScenarios = expectedScenariosByConfiguration.get(
    report.configuration
  );
  if (JSON.stringify(actualScenarios) !== JSON.stringify(expectedScenarios))
    throw new Error(
      `${report.configuration}: expected outcomes for ${expectedScenarios.join(', ')}, received ${actualScenarios.join(', ')}`
    );
}

const byScenario = new Map();
for (const report of reports) {
  for (const [scenario, outcome] of Object.entries(report.outcomes)) {
    const values = byScenario.get(scenario) || [];
    values.push({ configuration: report.configuration, outcome });
    byScenario.set(scenario, values);
  }
}

for (const [scenario, values] of byScenario) {
  if (values.length < 2) continue;
  const canonical = JSON.stringify(values[0].outcome);
  for (const value of values.slice(1)) {
    if (JSON.stringify(value.outcome) !== canonical)
      throw new Error(
        `${scenario} differs between ${values[0].configuration} and ${value.configuration}`
      );
  }
}

const expectedScenarioUniverse = [
  ...sharedScenarios,
  ...iosOnlyScenarios,
  ...androidOnlyScenarios,
].sort();
if (
  JSON.stringify([...byScenario.keys()].sort()) !==
  JSON.stringify(expectedScenarioUniverse)
)
  throw new Error(
    'Expected exactly the canonical 16-scenario outcome universe'
  );

process.stdout.write(
  `PASS compared ${byScenario.size} shared public outcomes across ${reports.length} configurations\n`
);
