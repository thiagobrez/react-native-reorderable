import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '..');
const temporaryRoot = mkdtempSync(
  join(tmpdir(), 'reorderable-legend-package-')
);
const tarball = join(temporaryRoot, 'react-native-reorderable.tgz');

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const runtimeDependencies = [
  tarball,
  'react@19.2.3',
  'react-native@0.85.0',
  'react-native-gesture-handler@3.0.0',
  'react-native-reanimated@4.3.0',
  'react-native-worklets@0.8.1',
  'jest@29.7.0',
  '@react-native/jest-preset@0.85.0',
  '@react-native/babel-preset@0.85.0',
];

function createConsumer(name, extraDependencies = []) {
  const directory = join(temporaryRoot, name);
  mkdirSync(directory);
  writeJson(join(directory, 'package.json'), {
    name,
    private: true,
    version: '1.0.0',
  });
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--legacy-peer-deps',
      '--no-audit',
      '--no-fund',
      ...runtimeDependencies,
      ...extraDependencies,
    ],
    directory
  );
  writeFileSync(
    join(directory, 'babel.config.cjs'),
    `module.exports = { presets: ['module:@react-native/babel-preset'] };\n`
  );
  writeFileSync(
    join(directory, 'jest.config.cjs'),
    `module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  testEnvironmentOptions: { customExportConditions: ['react-native', 'require'] },
  setupFilesAfterEnv: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((@)?react-native|react-native-reanimated|react-native-worklets|react-native-gesture-handler|react-native-reorderable|@legendapp/list)/)',
  ],
};
`
  );
  writeFileSync(
    join(directory, 'jest.setup.js'),
    `global.nativeFabricUIManager ??= {};
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-worklets', () =>
  require('react-native-worklets/src/mock')
);
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock')
);
require('react-native-reanimated').setUpTests();
`
  );
  return directory;
}

try {
  run('yarn', ['pack', '--filename', tarball], repository);

  const rootConsumer = createConsumer('root-without-legend-list');
  writeFileSync(
    join(rootConsumer, 'package.test.js'),
    `test('root entry loads without the optional peer', () => {
  expect(() => require.resolve('@legendapp/list/react-native')).toThrow();
  const root = require('react-native-reorderable');
  expect(root.ReorderableList).toBeDefined();
  expect(root.ReorderableLegendList).toBeUndefined();
  expect(root.ReorderableLegendSectionList).toBeUndefined();
});
`
  );
  run('npx', ['jest', '--runInBand', 'package.test.js'], rootConsumer);

  const legendConsumer = createConsumer('optional-with-legend-list', [
    '@legendapp/list@3.3.3',
    'typescript@6.0.3',
    '@types/react@19.2.0',
  ]);
  writeFileSync(
    join(legendConsumer, 'package.test.js'),
    `test('optional entry exposes only the certified wrappers', () => {
  const optional = require('react-native-reorderable/legend-list');
  expect(Object.keys(optional).sort()).toEqual([
    'ReorderableLegendList',
    'ReorderableLegendSectionList',
  ]);
});
`
  );
  writeFileSync(
    join(legendConsumer, 'consumer.tsx'),
    `import { createRef } from 'react';
import type { LegendListRef } from '@legendapp/list/react-native';
import type { SectionListRef } from '@legendapp/list/section-list';
import {
  ReorderableLegendList,
  ReorderableLegendSectionList,
  type ReorderableLegendListProps,
  type ReorderableLegendSectionListProps,
} from 'react-native-reorderable/legend-list';

type Row = { id: string };
const listRef = createRef<LegendListRef>();
const sectionRef = createRef<SectionListRef>();
const unsafeListProps: ReorderableLegendListProps<Row> = {
  // @ts-expect-error The wrapper owns all item rendering.
  children: null,
  data: [{ id: 'one' }],
  keyExtractor: (item) => item.id,
  onReorder: () => undefined,
  renderItem: () => null,
};
const unsafeSectionProps: ReorderableLegendSectionListProps<
  Row,
  { id: string; data: readonly Row[] }
> = {
  // @ts-expect-error The wrapper owns all item rendering.
  children: null,
  keyExtractor: (item) => item.id,
  onReorder: () => undefined,
  renderItem: () => null,
  sections: [{ id: 'one', data: [{ id: 'one' }] }],
};
const unsafeSectionCallbackProps: ReorderableLegendSectionListProps<
  Row,
  { id: string; data: readonly Row[] }
> = {
  // @ts-expect-error Provider-internal item callbacks are not safe to expose.
  itemsAreEqual: () => true,
  keyExtractor: (item) => item.id,
  onReorder: () => undefined,
  renderItem: () => null,
  sections: [{ id: 'one', data: [{ id: 'one' }] }],
};
const list = (
  <ReorderableLegendList
    data={[{ id: 'one' }]}
    drawDistance={240}
    keyExtractor={(item) => item.id}
    onReorder={() => undefined}
    recycleItems
    ref={listRef}
    renderItem={() => null}
  />
);
const sections = (
  <ReorderableLegendSectionList
    drawDistance={240}
    keyExtractor={(item: Row) => item.id}
    onReorder={() => undefined}
    ref={sectionRef}
    renderItem={() => null}
    sections={[{ id: 'one', data: [{ id: 'one' }] }]}
  />
);
void list;
void sections;
void unsafeListProps;
void unsafeSectionProps;
void unsafeSectionCallbackProps;
`
  );
  writeJson(join(legendConsumer, 'tsconfig.json'), {
    compilerOptions: {
      jsx: 'react-jsx',
      module: 'preserve',
      moduleResolution: 'bundler',
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: 'es2022',
    },
    include: ['consumer.tsx'],
  });
  run('npx', ['jest', '--runInBand', 'package.test.js'], legendConsumer);
  run('npx', ['tsc', '--noEmit'], legendConsumer);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
