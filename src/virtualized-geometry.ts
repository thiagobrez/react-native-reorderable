/* eslint-disable no-bitwise -- Fenwick traversal and binary search use integer bit operations. */
import type { ReorderableItemLayout } from './types';

export type EstimatedGeometry = {
  adaptive: boolean;
  count: number;
  estimate: number;
  exact: false;
  measuredCount: number;
  measuredCounts: Int32Array;
  measuredFlags: Uint8Array;
  measuredSizes: Float32Array;
  measuredSum: number;
  measuredSums: Float64Array;
};

export type ExactGeometry = {
  count: number;
  exact: true;
  lengths: Float64Array;
  offsets: Float64Array;
};

export type VirtualizedGeometry = EstimatedGeometry | ExactGeometry;

export type GeometryCorrection = Readonly<{
  anchorDelta: number;
  changed: boolean;
  updateSteps: number;
}>;

export type GeometryLookup = Readonly<{
  index: number;
  steps: number;
}>;

export type MeasurementQueue = {
  cursor: number;
  indices: number[];
  lengths: number[];
};

export type MeasurementBatchResult = Readonly<{
  anchorDelta: number;
  count: number;
  maximumUpdateSteps: number;
}>;

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `[react-native-reorderable] ${name} must be a positive finite number.`
    );
  }
}

export function createEstimatedGeometry(
  count: number,
  estimate: number,
  adaptive = false
): EstimatedGeometry {
  assertPositiveFinite(estimate, 'estimatedItemSize');
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(
      '[react-native-reorderable] Geometry item count must be a non-negative integer.'
    );
  }
  return {
    adaptive,
    count,
    estimate,
    exact: false,
    measuredCount: 0,
    measuredCounts: new Int32Array(count),
    measuredFlags: new Uint8Array(count),
    measuredSizes: new Float32Array(count),
    measuredSum: 0,
    measuredSums: new Float64Array(count),
  };
}

export function createExactGeometry(
  layouts: readonly ReorderableItemLayout[]
): ExactGeometry {
  const offsets = new Float64Array(layouts.length);
  const lengths = new Float64Array(layouts.length);
  for (let index = 0; index < layouts.length; index += 1) {
    const layout = layouts[index];
    if (
      layout == null ||
      layout.index !== index ||
      !Number.isFinite(layout.offset) ||
      layout.offset < 0 ||
      !Number.isFinite(layout.length) ||
      layout.length <= 0
    ) {
      throw new Error(
        `[react-native-reorderable] ReorderableList getItemLayout returned invalid exact geometry for index ${index}.`
      );
    }
    offsets[index] = layout.offset;
    lengths[index] = layout.length;
  }
  return { count: layouts.length, exact: true, lengths, offsets };
}

function fenwickAdd(
  tree: Float64Array | Int32Array,
  index: number,
  delta: number
) {
  'worklet';
  let steps = 0;
  for (let cursor = index; cursor < tree.length; cursor |= cursor + 1) {
    tree[cursor]! += delta;
    steps += 1;
  }
  return steps;
}

function fenwickPrefix(tree: Float64Array | Int32Array, end: number): number {
  'worklet';
  let sum = 0;
  for (
    let cursor = end - 1;
    cursor >= 0;
    cursor = (cursor & (cursor + 1)) - 1
  ) {
    sum += tree[cursor]!;
  }
  return sum;
}

function currentEstimate(geometry: EstimatedGeometry): number {
  'worklet';
  return geometry.adaptive && geometry.measuredCount > 0
    ? geometry.measuredSum / geometry.measuredCount
    : geometry.estimate;
}

export function itemOffset(
  geometry: VirtualizedGeometry,
  index: number
): number {
  'worklet';
  const bounded = Math.max(0, Math.min(geometry.count, index));
  if (geometry.exact) {
    if (bounded === geometry.count) {
      if (bounded === 0) return 0;
      return geometry.offsets[bounded - 1]! + geometry.lengths[bounded - 1]!;
    }
    return geometry.offsets[bounded]!;
  }
  const measuredSum = fenwickPrefix(geometry.measuredSums, bounded);
  const measuredCount = fenwickPrefix(geometry.measuredCounts, bounded);
  return measuredSum + (bounded - measuredCount) * currentEstimate(geometry);
}

export function itemLength(
  geometry: VirtualizedGeometry,
  index: number
): number {
  'worklet';
  if (index < 0 || index >= geometry.count) return 0;
  if (geometry.exact) return geometry.lengths[index]!;
  return geometry.measuredFlags[index] === 1
    ? geometry.measuredSizes[index]!
    : currentEstimate(geometry);
}

export function contentLength(geometry: VirtualizedGeometry): number {
  'worklet';
  return itemOffset(geometry, geometry.count);
}

export function applyMeasurement(
  geometry: VirtualizedGeometry,
  index: number,
  length: number,
  activeIndex = -1
): GeometryCorrection {
  'worklet';
  if (
    geometry.exact ||
    index < 0 ||
    index >= geometry.count ||
    !Number.isFinite(length) ||
    length <= 0
  ) {
    return { anchorDelta: 0, changed: false, updateSteps: 0 };
  }
  const previousLength =
    geometry.measuredFlags[index] === 1 ? geometry.measuredSizes[index]! : 0;
  if (previousLength === length) {
    return { anchorDelta: 0, changed: false, updateSteps: 0 };
  }
  const anchorBefore = activeIndex < 0 ? 0 : itemOffset(geometry, activeIndex);
  let updateSteps = fenwickAdd(
    geometry.measuredSums,
    index,
    length - previousLength
  );
  geometry.measuredSum += length - previousLength;
  if (geometry.measuredFlags[index] === 0) {
    geometry.measuredFlags[index] = 1;
    geometry.measuredCount += 1;
    updateSteps = Math.max(
      updateSteps,
      fenwickAdd(geometry.measuredCounts, index, 1)
    );
  }
  geometry.measuredSizes[index] = length;
  const anchorAfter = activeIndex < 0 ? 0 : itemOffset(geometry, activeIndex);
  return {
    anchorDelta: anchorAfter - anchorBefore,
    changed: true,
    updateSteps,
  };
}

export function applyMeasurementBatch(
  geometry: VirtualizedGeometry,
  queue: MeasurementQueue,
  activeIndex: number,
  limit = 4
): MeasurementBatchResult {
  'worklet';
  let anchorDelta = 0;
  let count = 0;
  let maximumUpdateSteps = 0;
  while (queue.cursor < queue.indices.length && count < limit) {
    const correction = applyMeasurement(
      geometry,
      queue.indices[queue.cursor]!,
      queue.lengths[queue.cursor]!,
      activeIndex
    );
    anchorDelta += correction.anchorDelta;
    maximumUpdateSteps = Math.max(maximumUpdateSteps, correction.updateSteps);
    queue.cursor += 1;
    count += 1;
  }
  return { anchorDelta, count, maximumUpdateSteps };
}

export function indexAtOffset(
  geometry: VirtualizedGeometry,
  offset: number,
  useMidpoint = false
): GeometryLookup {
  'worklet';
  if (!geometry.exact) {
    const estimate = currentEstimate(geometry);
    let bit =
      geometry.count === 0 ? 0 : 2 ** Math.floor(Math.log2(geometry.count));
    let index = 0;
    let prefixMeasuredCount = 0;
    let prefixMeasuredSum = 0;
    let prefixLength = 0;
    let steps = 0;
    for (; bit > 0; bit >>= 1) {
      steps += 1;
      const candidate = index + bit;
      if (candidate > geometry.count) continue;
      const candidateMeasuredCount =
        prefixMeasuredCount + geometry.measuredCounts[candidate - 1]!;
      const candidateMeasuredSum =
        prefixMeasuredSum + geometry.measuredSums[candidate - 1]!;
      const candidateLength =
        candidateMeasuredSum + (candidate - candidateMeasuredCount) * estimate;
      if (candidateLength <= offset) {
        index = candidate;
        prefixMeasuredCount = candidateMeasuredCount;
        prefixMeasuredSum = candidateMeasuredSum;
        prefixLength = candidateLength;
      }
    }
    if (
      useMidpoint &&
      index < geometry.count &&
      offset >= prefixLength + itemLength(geometry, index) / 2
    ) {
      index += 1;
    }
    return { index, steps };
  }
  let low = 0;
  let high = geometry.count;
  let steps = 0;
  while (low < high) {
    steps += 1;
    const middle = low + ((high - low) >> 1);
    const boundary =
      itemOffset(geometry, middle) +
      (useMidpoint
        ? itemLength(geometry, middle) / 2
        : itemLength(geometry, middle));
    if (offset < boundary) high = middle;
    else low = middle + 1;
  }
  return { index: low, steps };
}

export function geometryByteLength(geometry: VirtualizedGeometry): number {
  if (geometry.exact) {
    return geometry.offsets.byteLength + geometry.lengths.byteLength + 1;
  }
  return (
    geometry.measuredSums.byteLength +
    geometry.measuredCounts.byteLength +
    geometry.measuredSizes.byteLength +
    geometry.measuredFlags.byteLength +
    9
  );
}
