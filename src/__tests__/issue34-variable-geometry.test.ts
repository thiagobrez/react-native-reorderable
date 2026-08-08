import { describe, expect, it, jest } from '@jest/globals';

import {
  applyMeasurement,
  applyMeasurementBatch,
  createEstimatedGeometry,
  createExactGeometry,
  geometryByteLength,
  indexAtOffset,
  itemLength,
  itemOffset,
} from '../virtualized-geometry';
import { VirtualizedReorderEngine } from '../virtualized-reorder-engine';

describe('compact variable-height geometry', () => {
  it('uses the caller estimate, then adapts unmeasured rows from mounted measurements', () => {
    const geometry = createEstimatedGeometry(5, 60, true);

    expect(itemOffset(geometry, 4)).toBe(240);
    applyMeasurement(geometry, 0, 40);
    applyMeasurement(geometry, 1, 80);
    expect(itemLength(geometry, 2)).toBe(60);
    expect(itemOffset(geometry, 4)).toBe(240);

    applyMeasurement(geometry, 2, 120);
    expect(itemLength(geometry, 3)).toBe(80);
    expect(itemOffset(geometry, 4)).toBe(320);
  });

  it('gives exact layouts precedence over measurements and estimates', () => {
    const geometry = createExactGeometry([
      { index: 0, length: 30, offset: 0 },
      { index: 1, length: 90, offset: 30 },
      { index: 2, length: 45, offset: 120 },
    ]);

    expect(applyMeasurement(geometry, 1, 200).changed).toBe(false);
    expect(itemOffset(geometry, 2)).toBe(120);
    expect(itemLength(geometry, 1)).toBe(90);
  });

  it('updates prefixes and resolves destinations within logarithmic step gates', () => {
    const geometry = createEstimatedGeometry(10_000, 50);
    const correction = applyMeasurement(geometry, 5_000, 91);
    const lookup = indexAtOffset(geometry, 375_025, true);

    expect(correction.updateSteps).toBeLessThanOrEqual(15);
    expect(itemOffset(geometry, 5_001)).toBe(250_091);
    expect(lookup.index).toBe(7_500);
    expect(lookup.steps).toBeLessThanOrEqual(15);
  });

  it('matches a linear variable-height lookup at item ends and midpoints', () => {
    const geometry = createEstimatedGeometry(257, 61, true);
    for (let index = 0; index < 257; index += 3) {
      applyMeasurement(geometry, index, 35 + ((index * 29) % 97));
    }
    for (let offset = -10; offset < itemOffset(geometry, 257); offset += 47) {
      for (const useMidpoint of [false, true]) {
        let expected = 0;
        while (
          expected < geometry.count &&
          offset >=
            itemOffset(geometry, expected) +
              itemLength(geometry, expected) * (useMidpoint ? 0.5 : 1)
        ) {
          expected += 1;
        }
        const lookup = indexAtOffset(geometry, offset, useMidpoint);
        expect(lookup.index).toBe(expected);
        expect(lookup.steps).toBeLessThanOrEqual(10);
      }
    }
  });

  it('stays inside the 10k warm geometry storage budget', () => {
    const geometry = createEstimatedGeometry(10_000, 50);
    const bytes = geometryByteLength(geometry);
    const budget = 8 * 1024 * 1024 + 64 * 10_000;

    expect(bytes).toBe(170_009);
    expect(bytes).toBeLessThanOrEqual(budget);
  });

  it('keeps active-pointer anchor residual at zero as earlier rows correct', () => {
    const geometry = createEstimatedGeometry(1_000, 50);
    const activeIndex = 500;
    const before = itemOffset(geometry, activeIndex) + 10;
    const correction = applyMeasurement(geometry, 20, 83, activeIndex);
    const after = itemOffset(geometry, activeIndex) + 10;

    expect(after - before).toBe(33);
    expect(correction.anchorDelta).toBe(33);
    expect(
      Math.abs(after - before - correction.anchorDelta)
    ).toBeLessThanOrEqual(2);
  });

  it('applies no more than four queued corrections per frame', () => {
    const geometry = createEstimatedGeometry(10_000, 50);
    const queue = {
      cursor: 0,
      indices: Array.from({ length: 10 }, (_, index) => index),
      lengths: Array.from({ length: 10 }, (_, index) => 40 + index),
    };

    expect(applyMeasurementBatch(geometry, queue, 500, 4).count).toBe(4);
    expect(queue.cursor).toBe(4);
    expect(applyMeasurementBatch(geometry, queue, 500, 4).count).toBe(4);
    expect(queue.cursor).toBe(8);
    expect(applyMeasurementBatch(geometry, queue, 500, 4).count).toBe(2);
  });

  it('keeps every correction below one millisecond in the 10k benchmark harness', () => {
    const geometry = createEstimatedGeometry(10_000, 50);
    applyMeasurement(geometry, 9_999, 51);
    const durations = Array.from({ length: 64 }, (_, iteration) => {
      const started = performance.now();
      applyMeasurement(geometry, iteration * 131, 41 + (iteration % 37));
      return performance.now() - started;
    });

    expect(Math.max(...durations)).toBeLessThanOrEqual(1);
  });
});

describe('variable-height terminal semantics', () => {
  it('emits exactly one terminal result and at most one application commit', () => {
    const onCommit = jest.fn();
    const onTerminal = jest.fn();
    const ids = Array.from({ length: 20 }, (_, index) => `item-${index}`);
    const engine = new VirtualizedReorderEngine({
      itemIds: ids,
      estimatedItemSize: 50,
      onCommit,
      onTerminal,
    });
    engine.measure(0, 40);
    engine.measure(1, 80);
    engine.setViewport(200, 0);
    engine.start('item-0', []);
    engine.move(130);
    engine.finish(true);
    engine.finish(true);

    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledTimes(1);

    engine.start('item-2', []);
    engine.cancel();
    engine.cancel();
    expect(onTerminal).toHaveBeenCalledTimes(2);
    expect(onTerminal).toHaveBeenLastCalledWith(null);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
