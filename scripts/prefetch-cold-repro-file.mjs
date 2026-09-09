// Diagnostic control: read the measured slow file before any cold-boot iteration.
// This tests host file-cache readiness; it does not change feature values.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [runtimeVersion, outputPath] = process.argv.slice(2);
if (!runtimeVersion || !outputPath) throw new Error('Expected runtime and output path');
const runtimes = JSON.parse(
  execFileSync('xcrun', ['simctl', 'list', 'runtimes', '--json'], {
    encoding: 'utf8',
    timeout: 30000,
  })
).runtimes;
const matches = runtimes.filter(
  (runtime) => runtime.isAvailable &&
    runtime.identifier === `com.apple.CoreSimulator.SimRuntime.${runtimeVersion}`
);
if (matches.length !== 1) throw new Error('Expected one available runtime');
const runtime = matches[0];
const path = resolve(runtime.runtimeRoot, 'System/Library/FeatureFlags/Domain/UIKit.plist');
const startedAt = new Date().toISOString();
const started = performance.now();
const bytes = readFileSync(path);
const readMs = performance.now() - started;
const record = {
  runtime: runtime.identifier,
  path,
  startedAt,
  readMs,
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
};
mkdirSync(dirname(resolve(outputPath)), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify(record));
