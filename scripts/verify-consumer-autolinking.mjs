import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(0, 'utf8'));
const dependency = config.dependencies?.['react-native-reorderable'];
assert.ok(dependency, 'The packed package was not autolinked');
assert.ok(dependency.platforms?.android, 'Android autolinking is missing');
assert.ok(dependency.platforms?.ios, 'iOS autolinking is missing');
