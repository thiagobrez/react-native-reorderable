import { describe, expect, it } from '@jest/globals';

import { canonicalMoveSet, reconcileDrop, reconcileReorder } from '../semantic';

describe('reconcileDrop', () => {
  it('emits only canonical known identities and the known destination', () => {
    expect(
      reconcileDrop(
        ['blue', 'green', 'yellow'],
        ['yellow', 'blue', 'yellow'],
        ['archive'],
        'archive',
        true
      )
    ).toEqual({ itemIds: ['blue', 'yellow'], destinationId: 'archive' });
  });

  it.each<readonly [readonly string[], string, boolean]>([
    [[], 'archive', true],
    [['missing'], 'archive', true],
    [['blue'], 'missing', true],
    [['blue'], 'archive', false],
  ])('cancels an invalid or rejected terminal', (ids, zone, accepted) => {
    expect(
      reconcileDrop(['blue'], ids, ['archive'], zone, accepted)
    ).toBeNull();
  });
});

describe('canonicalMoveSet', () => {
  const sectionedOrder = [
    { sectionId: 'beginning-empty', itemIds: [] },
    { sectionId: 'favorites', itemIds: ['blue', 'green', 'yellow'] },
    { sectionId: 'middle-empty', itemIds: [] },
    { sectionId: 'others', itemIds: ['orange', 'pink'] },
    { sectionId: 'end-empty', itemIds: [] },
  ] as const;

  it('moves a selected activation as one filtered canonical move set', () => {
    expect(
      canonicalMoveSet(sectionedOrder, 'pink', [
        'pink',
        'missing',
        'green',
        'pink',
        'blue',
      ])
    ).toEqual(['blue', 'green', 'pink']);
  });

  it('moves only an unselected activation when another selection exists', () => {
    expect(
      canonicalMoveSet(sectionedOrder, 'yellow', ['blue', 'pink', 'missing'])
    ).toEqual(['yellow']);
  });

  it('returns no move set for an absent activation', () => {
    expect(canonicalMoveSet(sectionedOrder, 'missing', ['blue'])).toEqual([]);
  });
});

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

  it.each(['beginning-empty', 'middle-empty', 'end-empty'])(
    'moves a cross-section selection contiguously into the %s section',
    (sectionId) => {
      const order = [
        { sectionId: 'beginning-empty', itemIds: [] },
        { sectionId: 'favorites', itemIds: ['blue', 'green', 'yellow'] },
        { sectionId: 'middle-empty', itemIds: [] },
        { sectionId: 'others', itemIds: ['orange', 'pink'] },
        { sectionId: 'end-empty', itemIds: [] },
      ] as const;

      expect(
        reconcileReorder(order, ['blue', 'yellow', 'pink'], {
          sectionId,
          beforeId: null,
        })
      ).toEqual({
        sourceIds: ['blue', 'yellow', 'pink'],
        destination: { sectionId, beforeId: null },
        nextOrder: order.map((collection) => ({
          sectionId: collection.sectionId,
          itemIds:
            collection.sectionId === sectionId
              ? ['blue', 'yellow', 'pink']
              : collection.itemIds.filter(
                  (id) => !['blue', 'yellow', 'pink'].includes(id)
                ),
        })),
      });
    }
  );

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
