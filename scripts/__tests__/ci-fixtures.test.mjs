import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

const repository = resolve(import.meta.dirname, '../..');

test('Jest resolves the package self-reference to source in a clean checkout', () => {
  const metadata = JSON.parse(
    readFileSync(resolve(repository, 'package.json'), 'utf8')
  );

  assert.ok(
    metadata.jest.testEnvironmentOptions.customExportConditions.includes(
      'react-native-reorderable-source'
    )
  );
  assert.equal(
    metadata.jest.moduleNameMapper['^react-native-reorderable$'],
    '<rootDir>/src/index.tsx'
  );
});

test('Scenario Lab permits the candidate tarball to update the temporary lockfile', () => {
  const workflow = readFileSync(
    resolve(repository, '.github/workflows/exact-package-candidate.yml'),
    'utf8'
  );

  assert.match(
    workflow,
    /install-candidate-in-example\.mjs[\s\S]*?yarn install --no-immutable/
  );
  assert.match(
    workflow,
    /npx pod-install[\s\S]*?patch-fmt-consteval\.mjs[\s\S]*?xcodebuild/
  );
  assert.match(
    workflow,
    /expo-modules-autolinking react-native-config[\s\S]*?--platform '\$\{\{ matrix\.platform \}\}'[\s\S]*?--json/
  );
  assert.match(
    workflow,
    /EVENT_NAME: \$\{\{ github\.event_name \}\}[\s\S]*?PUSH_BEFORE_SHA: \$\{\{ github\.event\.before \}\}[\s\S]*?sha=\$PUSH_BEFORE_SHA/
  );
});

test('root-level Apple workflows select the example Gemfile for CocoaPods', () => {
  for (const workflowPath of [
    '.github/workflows/exact-package-candidate.yml',
    '.github/workflows/physical-performance.yml',
  ]) {
    const workflow = readFileSync(resolve(repository, workflowPath), 'utf8');
    assert.match(
      workflow,
      /BUNDLE_GEMFILE: example\/Gemfile[\s\S]*?bundle exec pod install --project-directory=example\/ios/
    );
  }
});

test('Expo clean consumers do not install the React Native community CLI', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'reorderable-consumer-'));
  writeFileSync(
    resolve(fixture, 'package.json'),
    `${JSON.stringify({ dependencies: {} }, null, 2)}\n`
  );

  execFileSync(
    process.execPath,
    [
      resolve(repository, 'scripts/configure-clean-consumer.mjs'),
      fixture,
      resolve(repository, 'candidate.tgz'),
      'expo',
      JSON.stringify({
        react: '19.2.3',
        reactNative: '0.86.2',
        reactNativeGestureHandler: '3.2.1',
        reactNativeReanimated: '4.5.3',
        reactNativeWorklets: '0.11.4',
      }),
    ],
    { stdio: 'pipe' }
  );

  const metadata = JSON.parse(
    readFileSync(resolve(fixture, 'package.json'), 'utf8')
  );
  assert.equal(
    metadata.devDependencies?.['@react-native-community/cli'],
    undefined
  );
});

test('the autolinking verifier accepts Expo platform-specific output', () => {
  execFileSync(
    process.execPath,
    [
      resolve(repository, 'scripts/verify-consumer-autolinking.mjs'),
      '--platform',
      'ios',
    ],
    {
      input: JSON.stringify({
        dependencies: {
          'react-native-reorderable': {
            platforms: { ios: { podspecPath: 'Reorderable.podspec' } },
          },
        },
      }),
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );
});

test('the fmt workaround disables only the vulnerable 11.0.2 consteval branch', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'reorderable-fmt-'));
  const header = resolve(fixture, 'base.h');
  writeFileSync(
    header,
    `#define FMT_VERSION 110002
#elif defined(__cpp_consteval)
#  define FMT_USE_CONSTEVAL 1
#elif FMT_GCC_VERSION >= 1002 || FMT_CLANG_VERSION >= 1101
#  define FMT_USE_CONSTEVAL 1
`
  );
  chmodSync(header, 0o444);

  const patcher = resolve(repository, 'scripts/patch-fmt-consteval.mjs');
  execFileSync(process.execPath, [patcher, header]);
  execFileSync(process.execPath, [patcher, header]);

  const patched = readFileSync(header, 'utf8');
  assert.match(
    patched,
    /#elif defined\(__cpp_consteval\)\n#  define FMT_USE_CONSTEVAL 0/
  );
  assert.match(
    patched,
    /#elif FMT_GCC_VERSION >= 1002 \|\| FMT_CLANG_VERSION >= 1101\n#  define FMT_USE_CONSTEVAL 1/
  );
  assert.equal(statSync(header).mode & 0o777, 0o444);
});
