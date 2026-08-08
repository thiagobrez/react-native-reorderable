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

export type FlatExactGeometry = {
  anchorFlags: Uint8Array;
  count: number;
  exact: true;
  grouped?: false;
  lengths: Float64Array;
  measuredFlags: Uint8Array;
  offsets: Float64Array;
};

export type GroupedExactGeometry = {
  anchorFlags: Uint8Array;
  anchorFrameIndices: Int32Array;
  anchorLengths: Float64Array;
  anchorOffsets: Float64Array;
  count: number;
  estimate: number;
  exact: true;
  frameAnchorOrdinals: Int32Array;
  frameGroupOrdinals: Int32Array;
  groupBases: Float64Array;
  groupEnds: Int32Array;
  groupSpans: Float64Array;
  groupStarts: Int32Array;
  grouped: true;
  measuredFlags: Uint8Array;
  measuredSizes: Float64Array;
  treeBase: number;
  treeMeasuredCounts: Int32Array;
  treeMeasuredSums: Float64Array;
};

export type ExactGeometry = FlatExactGeometry | GroupedExactGeometry;

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

const EXACT_LAYOUT_TOLERANCE = 0.5;

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
  const anchorFlags = new Uint8Array(layouts.length);
  anchorFlags.fill(1);
  const measuredFlags = new Uint8Array(anchorFlags);
  return {
    anchorFlags,
    count: layouts.length,
    exact: true,
    lengths,
    measuredFlags,
    offsets,
  };
}

export function createGroupedExactGeometry(
  exactItems: readonly (Omit<ReorderableItemLayout, 'index'> | null)[],
  estimate: number
): GroupedExactGeometry {
  assertPositiveFinite(estimate, 'estimatedItemSize');
  const count = exactItems.length;
  let anchorCount = 0;
  let previousEnd = 0;
  exactItems.forEach((layout, index) => {
    if (layout == null) return;
    if (
      !Number.isFinite(layout.offset) ||
      layout.offset < previousEnd ||
      !Number.isFinite(layout.length) ||
      layout.length <= 0
    )
      throw new Error(
        `[react-native-reorderable] ReorderableSectionList getItemLayout returned invalid anchored geometry for frame ${index}.`
      );
    previousEnd = layout.offset + layout.length;
    anchorCount += 1;
  });
  const anchorFlags = new Uint8Array(count);
  const anchorFrameIndices = new Int32Array(anchorCount);
  const anchorLengths = new Float64Array(anchorCount);
  const anchorOffsets = new Float64Array(anchorCount);
  const frameAnchorOrdinals = new Int32Array(count);
  const frameGroupOrdinals = new Int32Array(count);
  frameAnchorOrdinals.fill(-1);
  frameGroupOrdinals.fill(-1);
  let anchorOrdinal = 0;
  exactItems.forEach((layout, frameIndex) => {
    if (layout == null) return;
    anchorFlags[frameIndex] = 1;
    anchorFrameIndices[anchorOrdinal] = frameIndex;
    anchorLengths[anchorOrdinal] = layout.length;
    anchorOffsets[anchorOrdinal] = layout.offset;
    frameAnchorOrdinals[frameIndex] = anchorOrdinal;
    anchorOrdinal += 1;
  });
  const groupCount = anchorCount + 1;
  const groupBases = new Float64Array(groupCount);
  const groupEnds = new Int32Array(groupCount);
  const groupSpans = new Float64Array(groupCount);
  const groupStarts = new Int32Array(groupCount);
  groupSpans.fill(Number.NaN);
  for (let group = 0; group < groupCount; group += 1) {
    const previousAnchor = group - 1;
    const nextAnchor = group;
    const start =
      previousAnchor < 0 ? 0 : anchorFrameIndices[previousAnchor]! + 1;
    const end =
      nextAnchor >= anchorCount ? count : anchorFrameIndices[nextAnchor]!;
    const base =
      previousAnchor < 0
        ? 0
        : anchorOffsets[previousAnchor]! + anchorLengths[previousAnchor]!;
    groupStarts[group] = start;
    groupEnds[group] = end;
    groupBases[group] = base;
    if (nextAnchor < anchorCount) {
      const span = anchorOffsets[nextAnchor]! - base;
      if (span < 0)
        throw new Error(
          '[react-native-reorderable] ReorderableSectionList getItemLayout anchors overlap preceding content.'
        );
      groupSpans[group] = span;
    }
    for (let frame = start; frame < end; frame += 1)
      frameGroupOrdinals[frame] = group;
  }
  let treeBase = 1;
  while (treeBase < Math.max(1, count)) treeBase *= 2;
  const measuredFlags = new Uint8Array(count);
  const measuredSizes = new Float64Array(count);
  const treeMeasuredCounts = new Int32Array(treeBase * 2);
  const treeMeasuredSums = new Float64Array(treeBase * 2);
  for (let anchor = 0; anchor < anchorCount; anchor += 1) {
    const frame = anchorFrameIndices[anchor]!;
    measuredFlags[frame] = 1;
    measuredSizes[frame] = anchorLengths[anchor]!;
    treeMeasuredCounts[treeBase + frame] = 1;
    treeMeasuredSums[treeBase + frame] = anchorLengths[anchor]!;
  }
  for (let node = treeBase - 1; node > 0; node -= 1) {
    treeMeasuredCounts[node] =
      treeMeasuredCounts[node * 2]! + treeMeasuredCounts[node * 2 + 1]!;
    treeMeasuredSums[node] =
      treeMeasuredSums[node * 2]! + treeMeasuredSums[node * 2 + 1]!;
  }
  return {
    anchorFlags,
    anchorFrameIndices,
    anchorLengths,
    anchorOffsets,
    count,
    estimate,
    exact: true,
    frameAnchorOrdinals,
    frameGroupOrdinals,
    groupBases,
    groupEnds,
    groupSpans,
    groupStarts,
    grouped: true,
    measuredFlags,
    measuredSizes,
    treeBase,
    treeMeasuredCounts,
    treeMeasuredSums,
  };
}

function segmentRange(
  tree: Float64Array | Int32Array,
  treeBase: number,
  start: number,
  end: number
): number {
  'worklet';
  let left = start + treeBase;
  let right = end + treeBase;
  let total = 0;
  while (left < right) {
    if ((left & 1) === 1) total += tree[left++]!;
    if ((right & 1) === 1) total += tree[--right]!;
    left >>= 1;
    right >>= 1;
  }
  return total;
}

function segmentTotals(
  geometry: GroupedExactGeometry,
  start: number,
  end: number
): { measuredCount: number; measuredSum: number; steps: number } {
  'worklet';
  let left = start + geometry.treeBase;
  let right = end + geometry.treeBase;
  let measuredCount = 0;
  let measuredSum = 0;
  let steps = 0;
  while (left < right) {
    steps += 1;
    if ((left & 1) === 1) {
      measuredCount += geometry.treeMeasuredCounts[left]!;
      measuredSum += geometry.treeMeasuredSums[left++]!;
    }
    if ((right & 1) === 1) {
      right -= 1;
      measuredCount += geometry.treeMeasuredCounts[right]!;
      measuredSum += geometry.treeMeasuredSums[right]!;
    }
    left >>= 1;
    right >>= 1;
  }
  return { measuredCount, measuredSum, steps };
}

function groupedEstimate(
  geometry: GroupedExactGeometry,
  group: number
): number {
  'worklet';
  const start = geometry.groupStarts[group]!;
  const end = geometry.groupEnds[group]!;
  const measuredCount = segmentRange(
    geometry.treeMeasuredCounts,
    geometry.treeBase,
    start,
    end
  );
  const measuredSum = segmentRange(
    geometry.treeMeasuredSums,
    geometry.treeBase,
    start,
    end
  );
  const unknownCount = end - start - measuredCount;
  const span = geometry.groupSpans[group]!;
  if (!Number.isFinite(span)) return geometry.estimate;
  if (
    measuredSum > span + EXACT_LAYOUT_TOLERANCE ||
    (unknownCount === 0 &&
      Math.abs(measuredSum - span) > EXACT_LAYOUT_TOLERANCE)
  )
    throw new Error(
      `[react-native-reorderable] Measured ReorderableSectionList chrome contradicts exact item anchors in group ${group}: measured ${measuredSum}, anchored span ${span}.`
    );
  return unknownCount === 0 ? 0 : (span - measuredSum) / unknownCount;
}

export function applyGroupedExactMeasurement(
  geometry: GroupedExactGeometry,
  frameIndex: number,
  length: number
): GeometryCorrection {
  'worklet';
  if (
    frameIndex < 0 ||
    frameIndex >= geometry.count ||
    geometry.anchorFlags[frameIndex] === 1 ||
    !Number.isFinite(length) ||
    length < 0
  )
    return { anchorDelta: 0, changed: false, updateSteps: 0 };
  const previous =
    geometry.measuredFlags[frameIndex] === 1
      ? geometry.measuredSizes[frameIndex]!
      : 0;
  if (geometry.measuredFlags[frameIndex] === 1 && previous === length)
    return { anchorDelta: 0, changed: false, updateSteps: 0 };
  const group = geometry.frameGroupOrdinals[frameIndex]!;
  const start = geometry.groupStarts[group]!;
  const end = geometry.groupEnds[group]!;
  const totals = segmentTotals(geometry, start, end);
  const oldCount = totals.measuredCount;
  const nextCount =
    oldCount + (geometry.measuredFlags[frameIndex] === 0 ? 1 : 0);
  const oldSum = totals.measuredSum;
  const nextSum = oldSum + length - previous;
  const span = geometry.groupSpans[group]!;
  if (
    Number.isFinite(span) &&
    (nextSum > span + EXACT_LAYOUT_TOLERANCE ||
      (nextCount === end - start &&
        Math.abs(nextSum - span) > EXACT_LAYOUT_TOLERANCE))
  )
    throw new Error(
      `[react-native-reorderable] Measured ReorderableSectionList chrome contradicts exact item anchors in group ${group}: measured ${nextSum}, anchored span ${span}.`
    );
  let node = geometry.treeBase + frameIndex;
  const countDelta = geometry.measuredFlags[frameIndex] === 0 ? 1 : 0;
  let steps = totals.steps;
  while (node > 0) {
    geometry.treeMeasuredSums[node]! += length - previous;
    geometry.treeMeasuredCounts[node]! += countDelta;
    node >>= 1;
    steps += 1;
  }
  geometry.measuredFlags[frameIndex] = 1;
  geometry.measuredSizes[frameIndex] = length;
  return { anchorDelta: 0, changed: true, updateSteps: steps };
}

function groupedItemOffset(
  geometry: GroupedExactGeometry,
  index: number
): number {
  'worklet';
  if (index === geometry.count) {
    if (index === 0) return 0;
    const lastAnchor = geometry.frameAnchorOrdinals[index - 1]!;
    if (lastAnchor >= 0)
      return (
        geometry.anchorOffsets[lastAnchor]! +
        geometry.anchorLengths[lastAnchor]!
      );
    const group = geometry.frameGroupOrdinals[index - 1]!;
    const start = geometry.groupStarts[group]!;
    const measuredSum = segmentRange(
      geometry.treeMeasuredSums,
      geometry.treeBase,
      start,
      index
    );
    const measuredCount = segmentRange(
      geometry.treeMeasuredCounts,
      geometry.treeBase,
      start,
      index
    );
    return (
      geometry.groupBases[group]! +
      measuredSum +
      (index - start - measuredCount) * groupedEstimate(geometry, group)
    );
  }
  const anchor = geometry.frameAnchorOrdinals[index]!;
  if (anchor >= 0) return geometry.anchorOffsets[anchor]!;
  const group = geometry.frameGroupOrdinals[index]!;
  const start = geometry.groupStarts[group]!;
  const measuredSum = segmentRange(
    geometry.treeMeasuredSums,
    geometry.treeBase,
    start,
    index
  );
  const measuredCount = segmentRange(
    geometry.treeMeasuredCounts,
    geometry.treeBase,
    start,
    index
  );
  return (
    geometry.groupBases[group]! +
    measuredSum +
    (index - start - measuredCount) * groupedEstimate(geometry, group)
  );
}

function groupedItemLength(
  geometry: GroupedExactGeometry,
  index: number
): number {
  'worklet';
  const anchor = geometry.frameAnchorOrdinals[index]!;
  if (anchor >= 0) return geometry.anchorLengths[anchor]!;
  if (geometry.measuredFlags[index] === 1)
    return geometry.measuredSizes[index]!;
  return groupedEstimate(geometry, geometry.frameGroupOrdinals[index]!);
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
    if (geometry.grouped) return groupedItemOffset(geometry, bounded);
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
  if (geometry.exact)
    return geometry.grouped
      ? groupedItemLength(geometry, index)
      : geometry.lengths[index]!;
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
    length < 0
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
  if (geometry.grouped) {
    const anchorCount = geometry.anchorFrameIndices.length;
    let low = 0;
    let high = anchorCount;
    let steps = 0;
    while (low < high) {
      steps += 1;
      const middle = low + ((high - low) >> 1);
      const boundary =
        geometry.anchorOffsets[middle]! +
        (useMidpoint
          ? geometry.anchorLengths[middle]! / 2
          : geometry.anchorLengths[middle]!);
      if (offset < boundary) high = middle;
      else low = middle + 1;
    }
    const nextAnchor = low;
    if (
      nextAnchor < anchorCount &&
      offset >= geometry.anchorOffsets[nextAnchor]!
    )
      return { index: geometry.anchorFrameIndices[nextAnchor]!, steps };
    const group = nextAnchor;
    const start = geometry.groupStarts[group]!;
    const end = geometry.groupEnds[group]!;
    if (start === end)
      return {
        index:
          nextAnchor < anchorCount
            ? geometry.anchorFrameIndices[nextAnchor]!
            : geometry.count,
        steps,
      };
    const estimate = groupedEstimate(geometry, group);
    const prefixMeasuredSum = segmentRange(
      geometry.treeMeasuredSums,
      geometry.treeBase,
      0,
      start
    );
    const prefixMeasuredCount = segmentRange(
      geometry.treeMeasuredCounts,
      geometry.treeBase,
      0,
      start
    );
    let target =
      prefixMeasuredSum +
      (start - prefixMeasuredCount) * estimate +
      Math.max(0, offset - geometry.groupBases[group]!);
    let node = 1;
    let frame = 0;
    while (node < geometry.treeBase) {
      steps += 1;
      const left = node * 2;
      const nodeWidth = geometry.treeBase / 2 ** Math.floor(Math.log2(left));
      const leftWeight =
        geometry.treeMeasuredSums[left]! +
        (nodeWidth - geometry.treeMeasuredCounts[left]!) * estimate;
      if (target < leftWeight) node = left;
      else {
        target -= leftWeight;
        frame += nodeWidth;
        node = left + 1;
      }
    }
    frame = Math.max(start, Math.min(end - 1, frame));
    if (
      useMidpoint &&
      offset >=
        groupedItemOffset(geometry, frame) +
          groupedItemLength(geometry, frame) / 2
    )
      frame += 1;
    return {
      index:
        frame < end
          ? frame
          : nextAnchor < anchorCount
            ? geometry.anchorFrameIndices[nextAnchor]!
            : geometry.count,
      steps,
    };
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
    if (geometry.grouped)
      return (
        geometry.anchorFlags.byteLength +
        geometry.anchorFrameIndices.byteLength +
        geometry.anchorLengths.byteLength +
        geometry.anchorOffsets.byteLength +
        geometry.frameAnchorOrdinals.byteLength +
        geometry.frameGroupOrdinals.byteLength +
        geometry.groupBases.byteLength +
        geometry.groupEnds.byteLength +
        geometry.groupSpans.byteLength +
        geometry.groupStarts.byteLength +
        geometry.measuredFlags.byteLength +
        geometry.measuredSizes.byteLength +
        geometry.treeMeasuredCounts.byteLength +
        geometry.treeMeasuredSums.byteLength +
        17
      );
    return (
      geometry.offsets.byteLength +
      geometry.lengths.byteLength +
      geometry.anchorFlags.byteLength +
      geometry.measuredFlags.byteLength +
      1
    );
  }
  return (
    geometry.measuredSums.byteLength +
    geometry.measuredCounts.byteLength +
    geometry.measuredSizes.byteLength +
    geometry.measuredFlags.byteLength +
    9
  );
}
