import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';

function evaluateVerifier(file: string, expression: string): any {
  const verifierUrl = JSON.stringify(`file://${resolve(process.cwd(), file)}`);
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `const verifier = await import(${verifierUrl}); console.log(JSON.stringify(${expression}));`,
      ],
      { encoding: 'utf8' }
    )
  );
}

describe('issue #40 publication gates', () => {
  it('fails a Reassure render-count increase and significant slowdown', () => {
    const measurement = {
      name: 'critical list path',
      baseline: { meanCount: 2 },
      current: { meanCount: 3 },
      durationDiff: 1.25,
      isDurationDiffSignificant: true,
    };
    const output = {
      errors: [],
      countChanged: [measurement],
      significant: [measurement],
    };
    const failures = evaluateVerifier(
      'scripts/verify-reassure-output.mjs',
      `verifier.verifyReassureOutput(${JSON.stringify(output)}, undefined, [])`
    );

    expect(failures).toEqual([
      'critical list path: render count increased from 2 to 3',
      'critical list path: statistically significant slowdown of 1.250 ms',
    ]);
  });

  it('uses paired plain scenarios as timing controls', () => {
    const measurement = {
      name: 'paired plain FlatList critical render path',
      baseline: { meanCount: 2 },
      current: { meanCount: 2 },
      durationDiff: 0.101,
      isDurationDiffSignificant: true,
    };

    expect(
      evaluateVerifier(
        'scripts/verify-reassure-output.mjs',
        `verifier.verifyReassureOutput(${JSON.stringify({
          significant: [measurement],
        })}, undefined, [])`
      )
    ).toEqual([]);
  });

  it('ignores statistically significant timing changes below practical thresholds', () => {
    const measurement = {
      name: '24-section ReorderableSectionList critical render path',
      durationDiff: 0.638,
      relativeDurationDiff: 0.081,
      isDurationDiffSignificant: true,
    };

    expect(
      evaluateVerifier(
        'scripts/verify-reassure-output.mjs',
        `verifier.verifyReassureOutput(${JSON.stringify({
          significant: [measurement],
        })}, undefined, [])`
      )
    ).toEqual([]);
  });

  it.each([
    ['one millisecond', 1, 0.05],
    ['ten percent', 0.5, 0.1],
  ])(
    'fails a practical slowdown of %s',
    (_name, durationDiff, relativeDurationDiff) => {
      const measurement = {
        name: 'critical list path',
        durationDiff,
        relativeDurationDiff,
        isDurationDiffSignificant: true,
      };

      expect(
        evaluateVerifier(
          'scripts/verify-reassure-output.mjs',
          `verifier.verifyReassureOutput(${JSON.stringify({
            significant: [measurement],
          })}, undefined, [])`
        )
      ).toEqual([
        `critical list path: statistically significant slowdown of ${durationDiff.toFixed(3)} ms`,
      ]);
    }
  );

  it('only accepts a duration regression with an auditable reason', () => {
    const baselineCommit = 'a'.repeat(40);
    const measurement = {
      name: 'critical children path',
      durationDiff: 1.25,
      isDurationDiffSignificant: true,
    };

    const invalid = evaluateVerifier(
      'scripts/verify-reassure-output.mjs',
      `(() => { try { verifier.verifyReassureOutput(${JSON.stringify({
        metadata: { baseline: { commitHash: baselineCommit } },
        significant: [measurement],
      })}, ${JSON.stringify({
        regressions: [
          {
            name: measurement.name,
            metric: 'duration',
            baselineCommit,
            reason: '',
          },
        ],
      })}, []); return null; } catch (error) { return error.message; } })()`
    );
    expect(invalid).toContain('non-empty reason');
    const renderCountAcceptance = evaluateVerifier(
      'scripts/verify-reassure-output.mjs',
      `(() => { try { verifier.verifyReassureOutput({}, ${JSON.stringify({
        regressions: [
          {
            name: measurement.name,
            metric: 'render-count',
            baselineCommit,
            reason: 'Render count increases must still fail.',
          },
        ],
      })}, []); return null; } catch (error) { return error.message; } })()`
    );
    expect(renderCountAcceptance).toContain(
      'render-count increases cannot be accepted'
    );
    expect(
      evaluateVerifier(
        'scripts/verify-reassure-output.mjs',
        `verifier.verifyReassureOutput(${JSON.stringify({
          metadata: { baseline: { commitHash: baselineCommit } },
          significant: [measurement],
        })}, ${JSON.stringify({
          regressions: [
            {
              name: measurement.name,
              metric: 'duration',
              baselineCommit,
              reason: 'Accepted in the reviewed performance change.',
            },
          ],
        })}, [])`
      )
    ).toEqual([]);
  });
});
