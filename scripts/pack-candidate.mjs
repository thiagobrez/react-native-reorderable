import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '..');
const output = resolve(
  process.argv[2] ?? 'artifacts/candidate/react-native-reorderable.tgz'
);

mkdirSync(dirname(output), { recursive: true });
rmSync(output, { force: true });
execFileSync('yarn', ['pack', '--filename', output], {
  cwd: repository,
  stdio: 'inherit',
});

process.stdout.write(`${output}\n`);
