import { describe, expect, it } from '@jest/globals';

import { reconcileReorder } from '../semantic';

describe('reconcileReorder', () => {
  const sectionedOrder = [
    { sectionId: 'favorites', itemIds: ['blue', 'green', 'yellow'] },
    { sectionId: 'others', itemIds: ['orange', 'pink'] },
  ] as const;

  it('normalizes the move set into canonical current collection order', () => {
    expect(
      reconcileReorder(sectionedOrder, ['pink', 'green', 'blue', 'green'], {
        sectionId: 'others',
        beforeId: 'orange',
      })
    ).toEqual({
      sourceIds: ['blue', 'green', 'pink'],
      destination: { sectionId: 'others', beforeId: 'orange' },
      nextOrder: [
        { sectionId: 'favorites', itemIds: ['yellow'] },
        {
          sectionId: 'others',
          itemIds: ['blue', 'green', 'pink', 'orange'],
        },
      ],
    });
  });

  it('cancels the complete move when a source or destination is stale', () => {
    expect(
      reconcileReorder(sectionedOrder, ['blue', 'missing'], {
        sectionId: 'others',
        beforeId: null,
      })
    ).toBeNull();
    expect(
      reconcileReorder(sectionedOrder, ['blue'], {
        sectionId: 'missing',
        beforeId: null,
      })
    ).toBeNull();
    expect(
      reconcileReorder(sectionedOrder, ['blue'], {
        sectionId: 'others',
        beforeId: 'missing',
      })
    ).toBeNull();
  });

  it('suppresses destinations that leave application order unchanged', () => {
    expect(
      reconcileReorder(sectionedOrder, ['green'], {
        sectionId: 'favorites',
        beforeId: 'yellow',
      })
    ).toBeNull();
    expect(
      reconcileReorder(sectionedOrder, ['orange', 'pink'], {
        sectionId: 'others',
        beforeId: null,
      })
    ).toBeNull();
  });

  it('throws for empty and duplicate identities in current application order', () => {
    expect(() =>
      reconcileReorder([{ sectionId: null, itemIds: [''] }], [''], {
        sectionId: null,
        beforeId: null,
      })
    ).toThrow('Item identity must be a non-empty string');
    expect(() =>
      reconcileReorder(
        [
          { sectionId: 'one', itemIds: ['duplicate'] },
          { sectionId: 'two', itemIds: ['duplicate'] },
        ],
        ['duplicate'],
        { sectionId: 'two', beforeId: null }
      )
    ).toThrow('Duplicate item identity "duplicate"');
    expect(() =>
      reconcileReorder(
        [
          { sectionId: 'duplicate', itemIds: [] },
          { sectionId: 'duplicate', itemIds: [] },
        ],
        [],
        { sectionId: 'duplicate', beforeId: null }
      )
    ).toThrow('Duplicate section identity "duplicate"');
  });
});
