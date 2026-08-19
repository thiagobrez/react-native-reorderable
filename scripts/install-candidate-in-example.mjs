import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const tarball = resolve(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Expected a candidate tarball');

const exampleRoot = resolve(import.meta.dirname, '../example');
const packagePath = resolve(exampleRoot, 'package.json');
const metadata = JSON.parse(readFileSync(packagePath, 'utf8'));
metadata.dependencies['react-native-reorderable'] = `file:${relative(
  exampleRoot,
  tarball
)}`;
writeFileSync(packagePath, `${JSON.stringify(metadata, null, 2)}\n`);

writeFileSync(
  resolve(exampleRoot, 'react-native.config.js'),
  `module.exports = { project: { ios: { automaticPodsInstallation: true } } };\n`
);
writeFileSync(
  resolve(exampleRoot, 'metro.config.js'),
  `const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

module.exports = mergeConfig(getDefaultConfig(__dirname), {
  resolver: { unstable_enablePackageExports: true },
});
`
);
