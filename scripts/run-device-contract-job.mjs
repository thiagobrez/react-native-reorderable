import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

const configuration = process.argv[2];
if (configuration == null)
  throw new Error(
    'Usage: node scripts/run-device-contract-job.mjs <configuration>'
  );

function publishDirectoryChildren(source, destination) {
  if (!existsSync(source)) return;
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source))
    cpSync(resolve(source, entry), resolve(destination, entry), {
      recursive: true,
    });
}

function publishSuccessfulAttempt(attempt) {
  const attemptRoot = ['attempts', attempt];
  for (const category of ['agent-device', 'feedback', 'outcomes-by-case'])
    publishDirectoryChildren(
      resolve('artifacts/issue-39', category, configuration, ...attemptRoot),
      resolve('artifacts/issue-39', category, configuration)
    );
  publishDirectoryChildren(
    resolve(
      'artifacts/issue-39/detox',
      configuration,
      ...attemptRoot,
      'isolated'
    ),
    resolve('artifacts/issue-39/detox', configuration, 'isolated')
  );
  cpSync(
    resolve(
      'artifacts/issue-39/device-tables',
      `${configuration}-${attempt}.json`
    ),
    resolve('artifacts/issue-39/device-tables', `${configuration}.json`)
  );
  cpSync(
    resolve('artifacts/issue-39/outcomes', `${configuration}-${attempt}.json`),
    resolve('artifacts/issue-39/outcomes', `${configuration}.json`)
  );
}

const attempts = [];
let finalStatus = 1;
for (let index = 1; index <= 2; index += 1) {
  const attempt = `attempt-${index}`;
  const startedAt = Date.now();
  const result = spawnSync(
    process.execPath,
    ['scripts/run-device-contract-isolated.mjs', configuration],
    {
      env: { ...process.env, ISSUE39_MATRIX_ATTEMPT: attempt },
      stdio: 'inherit',
      timeout: 60 * 60 * 1000,
    }
  );
  finalStatus = result.status ?? 75;
  const retryableInfrastructureFailure =
    finalStatus === 75 || result.signal != null;
  attempts.push({
    attempt,
    durationMs: Date.now() - startedAt,
    exitCode: result.status,
    signal: result.signal,
    status: finalStatus === 0 ? 'passed' : 'failed',
    failureKind:
      finalStatus === 0
        ? null
        : retryableInfrastructureFailure
          ? 'infrastructure'
          : 'contract',
  });
  if (finalStatus === 0) {
    publishSuccessfulAttempt(attempt);
    break;
  }
  if (!retryableInfrastructureFailure) break;
}

const summaryPath = resolve(
  'artifacts/issue-39/device-tables',
  `${configuration}-job.json`
);
mkdirSync(dirname(summaryPath), { recursive: true });
writeFileSync(
  summaryPath,
  `${JSON.stringify({ configuration, attempts }, null, 2)}\n`
);
process.exitCode = finalStatus;
