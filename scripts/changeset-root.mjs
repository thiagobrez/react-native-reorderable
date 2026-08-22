import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '..');
const packagePath = resolve(repository, 'package.json');
const changesetBinary = resolve(repository, 'node_modules/.bin/changeset');
const original = JSON.parse(readFileSync(packagePath, 'utf8'));
const { workspaces, ...singlePackage } = original;

// Changesets intentionally excludes a monorepo root from its package graph. This
// repository publishes its root while using workspaces only for its example and
// docs, so expose the root as a single package for the duration of the command.
writeFileSync(packagePath, `${JSON.stringify(singlePackage, null, 2)}\n`);

let commandError;
try {
  execFileSync(changesetBinary, process.argv.slice(2), {
    cwd: repository,
    stdio: 'inherit',
    env: process.env,
  });
} catch (error) {
  commandError = error;
} finally {
  const changed = JSON.parse(readFileSync(packagePath, 'utf8'));
  const restored = {};
  for (const key of Object.keys(original)) {
    restored[key] = key === 'workspaces' ? workspaces : changed[key];
  }
  for (const [key, value] of Object.entries(changed)) {
    if (!(key in restored)) restored[key] = value;
  }
  writeFileSync(packagePath, `${JSON.stringify(restored, null, 2)}\n`);
}

if (commandError != null) throw commandError;
