import { performance } from 'node:perf_hooks';
import {
  applyGroupedExactMeasurement,
  createGroupedExactGeometry,
  geometryByteLength,
  indexAtOffset,
} from '../lib/module/virtualized-geometry.js';

const CHROME_COUNT = 100_000;
const exactItems = new Array(CHROME_COUNT + 2).fill(null);
exactItems[0] = { offset: 0, length: 40 };
exactItems[CHROME_COUNT + 1] = {
  offset: 40 + CHROME_COUNT * 8,
  length: 50,
};
const geometry = createGroupedExactGeometry(exactItems, 8);
const bytesBefore = geometryByteLength(geometry);
const typedArraysBefore = [
  geometry.anchorLengths,
  geometry.anchorOffsets,
  geometry.measuredFlags,
  geometry.measuredSizes,
  geometry.treeMeasuredCounts,
  geometry.treeMeasuredSums,
];
let maximumCorrectionMs = 0;
let maximumUpdateSteps = 0;
for (let sample = 0; sample < 1_000; sample += 1) {
  const index = 1 + ((sample * 7_919) % CHROME_COUNT);
  const started = performance.now();
  const correction = applyGroupedExactMeasurement(
    geometry,
    index,
    4 + ((index * 37) % 8)
  );
  maximumCorrectionMs = Math.max(
    maximumCorrectionMs,
    performance.now() - started
  );
  maximumUpdateSteps = Math.max(maximumUpdateSteps, correction.updateSteps);
}
let maximumLookupSteps = 0;
for (let sample = 0; sample < 1_000; sample += 1) {
  const lookup = indexAtOffset(
    geometry,
    40 + ((sample * 104_729) % (CHROME_COUNT * 8)),
    true
  );
  maximumLookupSteps = Math.max(maximumLookupSteps, lookup.steps);
}
const typedArraysAfter = [
  geometry.anchorLengths,
  geometry.anchorOffsets,
  geometry.measuredFlags,
  geometry.measuredSizes,
  geometry.treeMeasuredCounts,
  geometry.treeMeasuredSums,
];
const report = {
  bytes: bytesBefore,
  chromeCount: CHROME_COUNT,
  maximumCorrectionMs,
  maximumLookupSteps,
  maximumUpdateSteps,
  retainedTypedArrays: typedArraysBefore.every(
    (array, index) => array === typedArraysAfter[index]
  ),
};
const logarithmicBudget = 2 * Math.ceil(Math.log2(geometry.treeBase)) + 2;
const failures = [];
if (geometryByteLength(geometry) !== bytesBefore)
  failures.push('geometry allocation budget');
if (!report.retainedTypedArrays) failures.push('typed-array retention');
if (maximumUpdateSteps > logarithmicBudget) failures.push('update step budget');
if (maximumLookupSteps > logarithmicBudget) failures.push('lookup step budget');
if (maximumCorrectionMs > 1) failures.push('correction latency budget');

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0)
  throw new Error(`Issue #35 benchmark failed: ${failures.join(', ')}`);
