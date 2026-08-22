import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const platformFlag = process.argv.indexOf('--platform');
const platform =
  platformFlag === -1 ? undefined : process.argv[platformFlag + 1];
assert.ok(
  platform == null || platform === 'android' || platform === 'ios',
  'Platform must be android or ios'
);

const config = JSON.parse(readFileSync(0, 'utf8'));
const dependency = config.dependencies?.['react-native-reorderable'];
assert.ok(dependency, 'The packed package was not autolinked');
if (platform == null || platform === 'android')
  assert.ok(dependency.platforms?.android, 'Android autolinking is missing');
if (platform == null || platform === 'ios')
  assert.ok(dependency.platforms?.ios, 'iOS autolinking is missing');
