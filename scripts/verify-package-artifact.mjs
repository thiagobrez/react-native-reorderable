import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const tarball = resolve(
  process.argv[2] ?? 'artifacts/candidate/react-native-reorderable.tgz'
);
const manifestFlag = process.argv.indexOf('--manifest');
const manifestPath =
  manifestFlag === -1 ? undefined : resolve(process.argv[manifestFlag + 1]);

assert.ok(existsSync(tarball), `Candidate tarball does not exist: ${tarball}`);

const rootRuntime = [
  'DragDropContainer',
  'DraggableItem',
  'DropZone',
  'ReorderableContainer',
  'ReorderableItem',
  'ReorderableList',
  'ReorderableSection',
  'ReorderableSectionList',
].sort();
const rootTypes = [
  'AccessibilityStrings',
  'CollectionOrder',
  'DragDropContainerProps',
  'DraggableItemProps',
  'DropAnnouncementContext',
  'DropEvent',
  'DropZoneProps',
  'EnginePolicy',
  'ReorderAnnouncementContext',
  'ReorderDestination',
  'ReorderEvent',
  'ReorderableContainerProps',
  'ReorderableItemLayout',
  'ReorderableItemProps',
  'ReorderableListProps',
  'ReorderableListRenderItemInfo',
  'ReorderableListSection',
  'ReorderableSectionListProps',
  'ReorderableSectionListRenderItemInfo',
  'ReorderableSectionProps',
].sort();

function namesFromExportBlocks(source, typeOnly) {
  const expression = typeOnly
    ? /export type\s*\{([^}]*)\}/g
    : /export\s+(?!type)\{([^}]*)\}/g;
  return [...source.matchAll(expression)]
    .flatMap((match) => match[1].split(','))
    .map((name) =>
      name
        .trim()
        .split(/\s+as\s+/)
        .at(-1)
    )
    .filter(Boolean)
    .sort();
}

function declaredSurface(source) {
  return [
    ...source.matchAll(/export (?:declare function|type)\s+([A-Za-z0-9_]+)/g),
  ]
    .map((match) => match[1])
    .sort();
}

const temporaryRoot = mkdtempSync(join(tmpdir(), 'reorderable-candidate-'));
try {
  execFileSync('tar', ['-xzf', tarball, '-C', temporaryRoot]);
  const packageRoot = join(temporaryRoot, 'package');
  const metadata = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8')
  );
  const entries = execFileSync('tar', ['-tzf', tarball], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n');

  assert.deepEqual(metadata.peerDependencies, {
    '@legendapp/list': '^3.3.3',
    '@shopify/flash-list': '^2.3.2',
    'react': '>=19.1 <20',
    'react-native': '>=0.82 <0.87',
    'react-native-gesture-handler': '>=3 <4',
    'react-native-reanimated': '>=4.3 <5',
    'react-native-worklets': '>=0.8.0 <0.13.0',
  });
  assert.deepEqual(metadata.peerDependenciesMeta, {
    '@legendapp/list': { optional: true },
    '@shopify/flash-list': { optional: true },
  });
  assert.deepEqual(metadata['react-native-reorderable'], {
    architecture: 'new',
    jsEngine: 'hermes',
    platforms: { android: '>=24', ios: '>=15.1' },
  });
  assert.deepEqual(Object.keys(metadata.exports).sort(), [
    '.',
    './flash-list',
    './legend-list',
    './package.json',
  ]);

  const requiredFiles = [
    'package/package.json',
    'package/Reorderable.podspec',
    'package/android/build.gradle',
    'package/ios/ReorderableView.mm',
    'package/lib/module/index.js',
    'package/lib/module/flash-list.js',
    'package/lib/module/legend-list.js',
    'package/lib/typescript/src/index.d.ts',
    'package/lib/typescript/src/flash-list.d.ts',
    'package/lib/typescript/src/legend-list.d.ts',
  ];
  for (const file of requiredFiles) {
    assert.ok(entries.includes(file), `Packed artifact is missing ${file}`);
  }
  assert.equal(
    entries.some((entry) =>
      /(?:__tests__|__perf__|__fixtures__|\/example\/|\/docs\/|\/artifacts\/)/.test(
        entry
      )
    ),
    false,
    'Packed artifact contains repository-only files'
  );

  const rootDeclaration = readFileSync(
    join(packageRoot, 'lib/typescript/src/index.d.ts'),
    'utf8'
  );
  assert.deepEqual(namesFromExportBlocks(rootDeclaration, false), rootRuntime);
  assert.deepEqual(namesFromExportBlocks(rootDeclaration, true), rootTypes);
  assert.deepEqual(
    declaredSurface(
      readFileSync(
        join(packageRoot, 'lib/typescript/src/flash-list.d.ts'),
        'utf8'
      )
    ),
    [
      'ReorderableFlashList',
      'ReorderableFlashListProps',
      'ReorderableFlashSectionList',
      'ReorderableFlashSectionListProps',
    ].sort()
  );
  assert.deepEqual(
    declaredSurface(
      readFileSync(
        join(packageRoot, 'lib/typescript/src/legend-list.d.ts'),
        'utf8'
      )
    ),
    [
      'ReorderableLegendList',
      'ReorderableLegendListProps',
      'ReorderableLegendSectionList',
      'ReorderableLegendSectionListProps',
    ].sort()
  );

  const bytes = readFileSync(tarball);
  const manifest = {
    schemaVersion: 1,
    package: metadata.name,
    version: metadata.version,
    filename: basename(tarball),
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sourceCommit: process.env.GITHUB_SHA ?? null,
    channel: process.env.CANDIDATE_CHANNEL ?? null,
  };
  if (manifestPath != null) {
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
