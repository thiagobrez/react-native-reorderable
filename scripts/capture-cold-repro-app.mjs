// Diagnostic-only process capture, isolated from the synchronous gesture driver.
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [udid, directory, kind] = process.argv.slice(2);
const artifact = kind === 'files' ? 'app-files' : 'app-stacks';
const outputPath = resolve(directory, `${artifact}.txt`);
const record = { udid, kind, startedAt: new Date().toISOString() };
const execute = (command, args, timeout, options = {}) =>
  spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
    ...options,
  });

try {
  if (!['stacks', 'files'].includes(kind)) throw new Error('Unknown capture kind');
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
  let result;
  if (kind === 'files') {
    const output = openSync(outputPath, 'w');
    try {
      result = execute(
        '/usr/bin/sudo',
        ['-n', '/usr/bin/fs_usage', '-w', '-f', 'filesys', '-t', '60', targets[0][1]],
        90000,
        { stdio: ['ignore', output, 'pipe'], killSignal: 'SIGTERM' }
      );
    } finally {
      closeSync(output);
    }
  } else {
    result = execute(
      '/usr/bin/sample',
      [targets[0][1], '60', '10', '-file', outputPath],
      180000
    );
  }
  record.status = result.status;
  record.signal = result.signal;
  record.stderr = result.stderr;
  record.error = result.error?.message;
  const content = result.status === 0 ? readFileSync(outputPath, 'utf8') : '';
  if (kind === 'files')
    record.hasFileEvents = /^\s*\d{2}:\d{2}:\d{2}\.\d+/m.test(content);
  else record.hasStacks = /^\s+\d+ Thread_/m.test(content);
} catch (error) {
  record.error = error.message;
} finally {
  record.finishedAt = new Date().toISOString();
  writeFileSync(resolve(directory, `${artifact}.json`), JSON.stringify(record, null, 2));
}
