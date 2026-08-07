import { describe, expect, it } from '@jest/globals';

import { InteractionLifecycle } from '../lifecycle';

describe('issue 28 interaction lifecycle contract', () => {
  it.each([
    'outside release',
    'gesture interruption',
    'system interruption',
    'inactive app',
    'background app',
    'Android blur',
    'Android Back',
    'disabled container',
    'unmounted container',
  ])('%s is one terminal cancellation', () => {
    const lifecycle = new InteractionLifecycle();
    lifecycle.begin(1);

    expect(lifecycle.finish(1, 'cancel')).toBe(true);
    expect(lifecycle.finish(1, 'commit')).toBe(false);
    expect(lifecycle.active).toBe(false);
  });

  it('does not let a later cancellation replace an accepted commit', () => {
    const lifecycle = new InteractionLifecycle();
    lifecycle.begin(7);

    expect(lifecycle.finish(7, 'commit')).toBe(true);
    expect(lifecycle.finish(7, 'cancel')).toBe(false);
  });

  it('ignores stale terminal inputs after a newer interaction begins', () => {
    const lifecycle = new InteractionLifecycle();
    lifecycle.begin(3);
    lifecycle.begin(4);

    expect(lifecycle.finish(3, 'cancel')).toBe(false);
    expect(lifecycle.finish(4, 'commit')).toBe(true);
  });

  it('keeps a newer interaction active after an older terminal and claims cancellation once', () => {
    const lifecycle = new InteractionLifecycle();
    lifecycle.begin(12);
    lifecycle.begin(13);

    expect(lifecycle.finish(12, 'cancel')).toBe(false);
    expect(lifecycle.active).toBe(true);
    expect(lifecycle.cancelActive()).toBe(true);
    expect(lifecycle.cancelActive()).toBe(false);
  });
});
