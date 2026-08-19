import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const [directoryArgument, tarballArgument, kind, versionsArgument] =
  process.argv.slice(2);
assert.ok(directoryArgument, 'Expected a fixture directory');
assert.ok(tarballArgument, 'Expected a candidate tarball');
assert.ok(kind === 'bare' || kind === 'expo', 'Kind must be bare or expo');

const directory = resolve(directoryArgument);
const tarball = resolve(tarballArgument);
const versions = JSON.parse(versionsArgument ?? '{}');
const packagePath = resolve(directory, 'package.json');
const metadata = JSON.parse(readFileSync(packagePath, 'utf8'));
const tarballReference = `file:${relative(directory, tarball)}`;

metadata.dependencies = {
  ...metadata.dependencies,
  'react': versions.react,
  'react-native': versions.reactNative,
  'react-native-gesture-handler': versions.reactNativeGestureHandler,
  'react-native-reanimated': versions.reactNativeReanimated,
  'react-native-reorderable': tarballReference,
  'react-native-worklets': versions.reactNativeWorklets,
};
writeFileSync(packagePath, `${JSON.stringify(metadata, null, 2)}\n`);

const babelConfig =
  kind === 'bare'
    ? `module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['react-native-worklets/plugin'],
};
`
    : `module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
`;
writeFileSync(resolve(directory, 'babel.config.js'), babelConfig);
writeFileSync(
  resolve(directory, 'worklet-smoke.ts'),
  `export function workletSmoke() {
  'worklet';
  return 42;
}
`
);

writeFileSync(
  resolve(directory, 'App.tsx'),
  `import 'react-native-gesture-handler';
import { useState } from 'react';
import { SafeAreaView, Text } from 'react-native';
import { ReorderableList } from 'react-native-reorderable';

const initialRows = [{ id: 'one' }, { id: 'two' }];

export default function App() {
  const [rows, setRows] = useState(initialRows);
  return (
    <SafeAreaView>
      <ReorderableList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Text>{item.id}</Text>}
        onReorder={(event) => {
          const byId = new Map(rows.map((row) => [row.id, row]));
          setRows(event.nextOrder[0]!.itemIds.map((id) => byId.get(id)!));
        }}
      />
    </SafeAreaView>
  );
}
`
);
