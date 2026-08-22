import assert from 'node:assert/strict';
import {
  chmodSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const headerArgument = process.argv[2];
assert.ok(headerArgument, 'Expected the path to fmt/include/fmt/base.h');

const headerPath = resolve(headerArgument);
const source = readFileSync(headerPath, 'utf8');
assert.match(source, /#define FMT_VERSION 110002\b/, 'Expected fmt 11.0.2');

const vulnerable = `#elif defined(__cpp_consteval)
#  define FMT_USE_CONSTEVAL 1`;
const workaround = `#elif defined(__cpp_consteval)
#  define FMT_USE_CONSTEVAL 0  // Apple Clang 21 workaround`;

if (source.includes(workaround)) process.exit(0);
assert.ok(
  source.includes(vulnerable),
  'Expected the fmt 11.0.2 consteval branch'
);

const originalMode = statSync(headerPath).mode & 0o777;
chmodSync(headerPath, originalMode | 0o200);
try {
  writeFileSync(headerPath, source.replace(vulnerable, workaround));
} finally {
  chmodSync(headerPath, originalMode);
}
