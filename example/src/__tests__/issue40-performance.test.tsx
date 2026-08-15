import { describe, expect, it } from '@jest/globals';

import { parseIssue40PerformanceLink } from '../issue40-performance';

describe('issue #40 physical performance route', () => {
  it('keeps the automated harness outside the public Scenario Lab catalog', () => {
    expect(
      parseIssue40PerformanceLink('reorderable://performance/control')
    ).toBe('control');
    expect(
      parseIssue40PerformanceLink('reorderable://performance/fallback')
    ).toBe('fallback');
    expect(
      parseIssue40PerformanceLink('reorderable://lab/exact-10000')
    ).toBeNull();
  });
});
