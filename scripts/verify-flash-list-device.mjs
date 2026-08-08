import { execFileSync } from 'node:child_process';

const forwarded = process.argv.slice(2);
for (const scenario of ['flash-list', 'flash-section-list']) {
  execFileSync(
    'node',
    [
      'scripts/verify-named-scenario-device.mjs',
      ...forwarded,
      '--scenario',
      scenario,
    ],
    { stdio: 'inherit' }
  );
}
