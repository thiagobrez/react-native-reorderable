import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MIN_SAMPLES = 3;
const MIN_DROP_CHANGE_RATIO = 0.02;
const FEEDBACK_CONFIGURATIONS = [
  'android.fallback',
  'ios26.auto-fallback',
  'ios27.fallback',
  'ios27.native',
];
const FEEDBACK_SCENARIOS = [
  'free-form-reorder',
  'multi-selection-reorder',
  'scoped-drop',
  'section-list-reorder',
  'virtualized-list-reorder',
];

export function assertFeedbackUniverse(runs) {
  const expected = FEEDBACK_CONFIGURATIONS.flatMap((configuration) =>
    FEEDBACK_SCENARIOS.map((scenario) => `${configuration}/${scenario}`)
  ).sort();
  const actual = runs
    .map(({ configuration, scenario }) => `${configuration}/${scenario}`)
    .sort();
  if (new Set(actual).size !== actual.length)
    throw new Error(
      'feedback report contains duplicate configuration/scenario runs'
    );
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `feedback report must contain exactly the canonical 20 runs; received ${actual.length}`
    );
}

export function matchingLabels(labels, expected) {
  const normalized = expected.trim().toLocaleLowerCase();
  const exact = labels.filter(
    ({ text }) => text.trim().toLocaleLowerCase() === normalized
  );
  if (exact.length > 0) return exact;
  // Vision can confuse glyphs in a moving, semi-transparent preview
  // (observed as row -> rom/roin and Card -> Sard). Normalize only those
  // observed tokens;
  // every other character, including the public numeric identity, stays exact.
  return labels.filter(({ text }) => {
    const candidate = text
      .trim()
      .toLocaleLowerCase()
      .replace(/\bsard\b/g, 'card')
      .replace(/\b(?:rom|roin)\b/g, 'row');
    return candidate === normalized;
  });
}

function uniqueLabel(sample, expected) {
  const matches = matchingLabels(sample.labels ?? [], expected);
  if (matches.length !== 1) {
    throw new Error(
      `${sample.path}: expected exactly one public label ${JSON.stringify(expected)}, found ${matches.length}`
    );
  }
  return matches[0];
}

function optionalUniqueLabel(sample, expected) {
  const matches = matchingLabels(sample.labels ?? [], expected);
  if (matches.length > 1) {
    throw new Error(
      `${sample.path}: expected at most one public label ${JSON.stringify(expected)}, found ${matches.length}`
    );
  }
  return matches[0];
}

function centerY(label) {
  return label.bounds.y + label.bounds.height / 2;
}

export function verifyFeedbackReport(report, { enforceUniverse = true } = {}) {
  if (!Array.isArray(report.runs) || report.runs.length === 0) {
    throw new Error('feedback report contains no runs');
  }
  if (enforceUniverse) assertFeedbackUniverse(report.runs);
  for (const run of report.runs) {
    if (!Array.isArray(run.samples) || run.samples.length < MIN_SAMPLES) {
      throw new Error(
        `${run.configuration}/${run.scenario}: expected at least ${MIN_SAMPLES} hold samples`
      );
    }
    let sourcePositionSamples = 0;
    for (const sample of run.samples) {
      if (run.kind === 'reorder') {
        const baseline = {
          path: `${run.configuration}/${run.scenario}/baseline.png`,
          labels: run.baselineLabels,
        };
        const baselinePredecessor = uniqueLabel(baseline, run.predecessorLabel);
        const baselineTarget = uniqueLabel(baseline, run.targetLabel);
        const sourceMatches = matchingLabels(
          sample.labels ?? [],
          run.sourceLabel
        );
        if (sourceMatches.length > 1) {
          throw new Error(
            `${sample.path}: expected exactly one public label ${JSON.stringify(run.sourceLabel)}, found ${sourceMatches.length}`
          );
        }
        const source = sourceMatches[0];
        const predecessor = optionalUniqueLabel(sample, run.predecessorLabel);
        const target = optionalUniqueLabel(sample, run.targetLabel);
        const liveLabelsVisible = predecessor != null && target != null;
        const lower = Math.min(
          centerY(liveLabelsVisible ? predecessor : baselinePredecessor),
          centerY(liveLabelsVisible ? target : baselineTarget)
        );
        const upper = Math.max(
          centerY(liveLabelsVisible ? predecessor : baselinePredecessor),
          centerY(liveLabelsVisible ? target : baselineTarget)
        );
        const sourcePosition = source == null ? null : centerY(source);
        const sourcePositionValid =
          sourcePosition != null &&
          sourcePosition > lower &&
          sourcePosition < upper;
        if (sourcePositionValid) {
          sourcePositionSamples += 1;
        }
        if (
          (!sourcePositionValid || !liveLabelsVisible) &&
          (typeof sample.destinationChangeRatio !== 'number' ||
            sample.destinationChangeRatio < MIN_DROP_CHANGE_RATIO)
        ) {
          throw new Error(
            `${sample.path}: occluded insertion band visual change ${sample.destinationChangeRatio ?? 'missing'} is below ${MIN_DROP_CHANGE_RATIO}`
          );
        }
      } else if (run.kind === 'drop') {
        uniqueLabel(sample, run.visualTargetLabel ?? run.targetLabel);
        if (
          typeof sample.destinationChangeRatio !== 'number' ||
          sample.destinationChangeRatio < MIN_DROP_CHANGE_RATIO
        ) {
          throw new Error(
            `${sample.path}: public destination visual change ${sample.destinationChangeRatio ?? 'missing'} is below ${MIN_DROP_CHANGE_RATIO}`
          );
        }
      } else {
        throw new Error(
          `${run.configuration}/${run.scenario}: unknown feedback kind ${run.kind}`
        );
      }
    }
    if (run.kind === 'reorder') {
      const minimumPositionSamples = Math.floor(run.samples.length / 2) + 1;
      if (sourcePositionSamples < minimumPositionSamples) {
        throw new Error(
          `${run.configuration}/${run.scenario}: expected source-position evidence in at least ${minimumPositionSamples} of ${run.samples.length} hold samples, found ${sourcePositionSamples}`
        );
      }
    }
  }
  return report.runs.length;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const caseMode = process.argv[2] === '--case';
  const path = process.argv[caseMode ? 3 : 2];
  if (path == null)
    throw new Error(
      'Usage: node scripts/verify-device-feedback.mjs [--case] <report>'
    );
  const report = JSON.parse(readFileSync(path, 'utf8'));
  const count = verifyFeedbackReport(report, { enforceUniverse: !caseMode });
  process.stdout.write(`Verified continuous feedback for ${count} runs\n`);
}
