import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '..');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'reorderable-flash-package-'));
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
  setupFilesAfterEnv: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((@)?react-native|react-native-reanimated|react-native-worklets|react-native-gesture-handler|react-native-reorderable|@shopify/flash-list)/)',
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

  const rootConsumer = createConsumer('root-without-flash-list');
  writeFileSync(
    join(rootConsumer, 'package.test.js'),
    `test('root entry loads without the optional peer', () => {
  expect(() => require.resolve('@shopify/flash-list')).toThrow();
  const root = require('react-native-reorderable');
  expect(root.ReorderableList).toBeDefined();
  expect(root.ReorderableFlashList).toBeUndefined();
  expect(root.ReorderableFlashSectionList).toBeUndefined();
});
`
  );
  run('npx', ['jest', '--runInBand', 'package.test.js'], rootConsumer);

  const flashConsumer = createConsumer('optional-with-flash-list', [
    '@shopify/flash-list@2.3.2',
    'typescript@6.0.3',
    '@types/react@19.2.0',
  ]);
  writeFileSync(
    join(flashConsumer, 'package.test.js'),
    `test('optional entry exposes only the certified wrappers', () => {
  const optional = require('react-native-reorderable/flash-list');
  expect(Object.keys(optional).sort()).toEqual([
    'ReorderableFlashList',
    'ReorderableFlashSectionList',
  ]);
});
`
  );
  writeFileSync(
    join(flashConsumer, 'consumer.tsx'),
    `import { createRef } from 'react';
import type { FlashListRef } from '@shopify/flash-list';
import { ReorderableFlashList } from 'react-native-reorderable/flash-list';

type Row = { id: string };
const ref = createRef<FlashListRef<Row>>();
const view = (
  <ReorderableFlashList
    data={[{ id: 'one' }]}
    drawDistance={240}
    keyExtractor={(item) => item.id}
    onReorder={() => undefined}
    ref={ref}
    renderItem={() => null}
  />
);
void view;
`
  );
  writeJson(join(flashConsumer, 'tsconfig.json'), {
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
  run('npx', ['jest', '--runInBand', 'package.test.js'], flashConsumer);
  run('npx', ['tsc', '--noEmit'], flashConsumer);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
