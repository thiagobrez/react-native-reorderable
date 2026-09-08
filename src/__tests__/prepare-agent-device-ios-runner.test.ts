import { describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const preflight = resolve('scripts/prepare-agent-device-ios-runner.mjs');

function runPreflight(alert: 'accepted' | 'absent' | 'busy') {
  const directory = mkdtempSync(join(tmpdir(), 'ios-preflight-'));
  const callsPath = join(directory, 'calls.json');
  const agentPath = join(directory, 'agent-device');
  writeFileSync(
    join(directory, 'xcrun'),
    `#!/usr/bin/env node
console.log(JSON.stringify({ devices: { 'iOS-26-5': [{ name: 'iPhone 17 Pro', udid: 'fixture-device' }] } }));
`,
    { mode: 0o755 }
  );
  writeFileSync(
    agentPath,
    `#!/usr/bin/env node
const fs = require('node:fs');
const callsPath = process.env.PREFLIGHT_CALLS;
const args = process.argv.slice(2);
const calls = fs.existsSync(callsPath) ? JSON.parse(fs.readFileSync(callsPath, 'utf8')) : [];
calls.push(args);
fs.writeFileSync(callsPath, JSON.stringify(calls));
if (args[0] === 'alert') {
  const busy = process.env.PREFLIGHT_ALERT === 'busy';
  const absent = process.env.PREFLIGHT_ALERT === 'absent';
  if (busy || absent) {
    console.log(JSON.stringify({ error: {
      code: busy ? 'RUNNER_BUSY' : 'COMMAND_FAILED',
      message: 'alert not found',
      details: { runnerErrorCode: busy ? 'RUNNER_BUSY' : 'ALERT_NOT_FOUND' }
    } }));
    process.exit(1);
  }
  console.log(JSON.stringify({ success: true }));
}
if (args[0] === 'wait' && args[1].startsWith('Current order') && process.env.PREFLIGHT_ALERT === 'accepted') {
  const lastLink = calls.findLastIndex(call => call[0] === 'open' && call[1].startsWith('reorderable://'));
  if (!calls.slice(lastLink + 1).some(call => call[0] === 'alert' && call[1] === 'accept')) process.exit(1);
}
`,
    { mode: 0o755 }
  );
  try {
    const result = spawnSync(
      process.execPath,
      [preflight, 'ios26.auto-fallback'],
      {
        cwd: directory,
        encoding: 'utf8',
        timeout: 15000,
        env: {
          ...process.env,
          CI: 'false',
          PATH: `${directory}:${process.env.PATH}`,
          AGENT_DEVICE_BIN: agentPath,
          PREFLIGHT_CALLS: callsPath,
          PREFLIGHT_ALERT: alert,
        },
      }
    );
    return {
      status: result.status,
      calls: JSON.parse(readFileSync(callsPath, 'utf8')) as string[][],
      confirmed: existsSync(
        join(
          directory,
          'artifacts/issue-39/agent-device/ios26.auto-fallback/replay-daemon-state/deep-link-confirmed'
        )
      ),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('iOS runner preflight confirmation', () => {
  it('confirms one deep-link open before verifying the app outcome', () => {
    const result = runPreflight('accepted');
    expect(result.status).toBe(0);
    expect(result.confirmed).toBe(true);
    expect(
      result.calls.filter((call) => call[0] === 'alert').map((call) => call[1])
    ).toEqual(['get', 'accept']);
    expect(
      result.calls.filter(
        (call) => call[0] === 'open' && call[1]?.startsWith('reorderable://')
      )
    ).toHaveLength(1);
  });

  it('allows a previously confirmed URL when the runner explicitly reports no alert', () => {
    const result = runPreflight('absent');
    expect(result.status).toBe(0);
    expect(result.confirmed).toBe(true);
    expect(
      result.calls.filter((call) => call[0] === 'alert').map((call) => call[1])
    ).toEqual(['get']);
  });

  it('stops on runner contention even when the error text says alert not found', () => {
    const result = runPreflight('busy');
    expect(result.status).not.toBe(0);
    expect(result.confirmed).toBe(false);
    expect(
      result.calls.some(
        (call) => call[0] === 'wait' && call[1]?.startsWith('Current order')
      )
    ).toBe(false);
    expect(result.calls.at(-1)?.slice(0, 2)).toEqual(['daemon', 'stop']);
  });
});
