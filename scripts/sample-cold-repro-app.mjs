// Diagnostic-only stack capture, isolated from the synchronous gesture driver.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [udid, directory] = process.argv.slice(2);
const record = { udid, startedAt: new Date().toISOString() };
const execute = (command, args, timeout) =>
  spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
  });

try {
  const processes = execute('/bin/ps', ['-axo', 'pid=,comm='], 5000);
  if (processes.status !== 0) throw new Error('App process discovery failed');
  const targets = processes.stdout
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(.+)$/))
    .filter(
      (match) =>
        match != null &&
        match[2].includes(`/Devices/${udid}/`) &&
        match[2].endsWith('/ReorderableExample.app/ReorderableExample')
    );
  if (targets.length !== 1)
    throw new Error(`Expected one app on ${udid}; found ${targets.length}`);
  record.targetPid = Number(targets[0][1]);
  record.executable = targets[0][2];
  record.commandStartedAt = new Date().toISOString();
  const result = execute(
    '/usr/bin/sample',
    [targets[0][1], '60', '10', '-mayDie', '-file', resolve(directory, 'app-stacks.txt')],
    180000
  );
  record.status = result.status;
  record.signal = result.signal;
  record.stderr = result.stderr;
  record.error = result.error?.message;
} catch (error) {
  record.error = error.message;
} finally {
  record.finishedAt = new Date().toISOString();
  writeFileSync(resolve(directory, 'app-stacks.json'), JSON.stringify(record, null, 2));
}
