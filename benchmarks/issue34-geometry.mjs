import { performance } from 'node:perf_hooks';
import {
  applyMeasurement,
  applyMeasurementBatch,
  createEstimatedGeometry,
  geometryByteLength,
  indexAtOffset,
  itemOffset,
} from '../lib/module/virtualized-geometry.js';

const ITEM_COUNT = 10_000;
const geometry = createEstimatedGeometry(ITEM_COUNT, 68);
const byteBudget = 8 * 1024 * 1024 + 64 * ITEM_COUNT;
const bytes = geometryByteLength(geometry);

let maximumLookupSteps = 0;
for (let sample = 0; sample < 1_000; sample += 1) {
  const contentY = ((sample * 7_919) % ITEM_COUNT) * 68 + 17;
  maximumLookupSteps = Math.max(
    maximumLookupSteps,
    indexAtOffset(geometry, contentY, true).steps
  );
}

const correctionDurationsMs = [];
let maximumUpdateSteps = 0;
for (let sample = 0; sample < 256; sample += 1) {
  const index = (sample * 131) % ITEM_COUNT;
  const started = performance.now();
  const correction = applyMeasurement(
    geometry,
    index,
    40 + ((index * 37) % 5) * 14
  );
  correctionDurationsMs.push(performance.now() - started);
  maximumUpdateSteps = Math.max(maximumUpdateSteps, correction.updateSteps);
}

const activeIndex = 7_500;
const anchorBefore = itemOffset(geometry, activeIndex);
const anchorCorrection = applyMeasurement(geometry, 10, 93, activeIndex);
const anchorAfter = itemOffset(geometry, activeIndex);
const anchorResidualPx = Math.abs(
  anchorAfter - anchorBefore - anchorCorrection.anchorDelta
);

const queue = {
  cursor: 0,
  indices: Array.from({ length: 40 }, (_, index) => 500 + index),
  lengths: Array.from({ length: 40 }, (_, index) => 45 + (index % 29)),
};
let maximumCorrectionsPerFrame = 0;
while (queue.cursor < queue.indices.length) {
  maximumCorrectionsPerFrame = Math.max(
    maximumCorrectionsPerFrame,
    applyMeasurementBatch(geometry, queue, activeIndex, 4).count
  );
}

const report = {
  anchorResidualPx,
  byteBudget,
  bytes,
  itemCount: ITEM_COUNT,
  maximumCorrectionMs: Math.max(...correctionDurationsMs),
  maximumCorrectionsPerFrame,
  maximumLookupSteps,
  maximumUpdateSteps,
};

const failures = [];
if (bytes > byteBudget) failures.push('geometry byte budget');
if (maximumLookupSteps > 15) failures.push('lookup step budget');
if (maximumUpdateSteps > 15) failures.push('update step budget');
if (report.maximumCorrectionMs > 1) failures.push('correction latency budget');
if (maximumCorrectionsPerFrame > 4) failures.push('corrections-per-frame budget');
if (anchorResidualPx > 2) failures.push('active pointer anchor budget');

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) {
  throw new Error(`Issue #34 benchmark failed: ${failures.join(', ')}`);
}
