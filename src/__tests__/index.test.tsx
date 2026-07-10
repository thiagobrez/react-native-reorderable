import { describe, expect, it } from '@jest/globals';
import type { ReactElement } from 'react';
import { Text, View, type ViewProps } from 'react-native';

import {
  DragContainer,
  DraggableItem,
  DropZone,
  ReorderableContainer,
  ReorderableItem,
  ReorderableSection,
  isNativeReorderingAvailable,
} from '..';
import {
  applyMoveToOrder,
  mapNativeDropEvent,
  normalizeDragChildren,
  normalizeReorderableChildren,
  prepareNativeEntries,
} from '../normalize';

const reorderMarkers = {
  Item: ReorderableItem,
  Section: ReorderableSection,
};
const dragMarkers = { Item: DraggableItem, DropZone };

describe('compound child normalization', () => {
  it('preserves arbitrary item content and styles', () => {
    const content = <Text testID="content">Arbitrary content</Text>;
    const normalized = normalizeReorderableChildren(
      <ReorderableItem id="one" style={{ flexGrow: 1 }}>
        {content}
      </ReorderableItem>,
      reorderMarkers
    );
    const child = normalized.children[0] as ReactElement<ViewProps>;

    expect(normalized.entryKinds).toEqual(['item']);
    expect(normalized.entryIds).toEqual(['one']);
    expect(normalized.order).toEqual([{ sectionId: null, itemIds: ['one'] }]);
    expect(child.props.children).toBe(content);
    expect(child.props.id).toBe('item:one');
    expect(
      (child.props as ViewProps & { entryIdentifier: string }).entryIdentifier
    ).toBe('item:one');
    expect(child.props.style).toEqual({ flexGrow: 1 });
  });

  it('flattens structural section entries without owning presentation', () => {
    const header = <Text>Favorites</Text>;
    const normalized = normalizeReorderableChildren(
      <ReorderableSection id="favorites" header={header} style={{ gap: 8 }}>
        <ReorderableItem id="blue">
          <View />
        </ReorderableItem>
        <ReorderableItem id="green">
          <View />
        </ReorderableItem>
      </ReorderableSection>,
      reorderMarkers
    );

    expect(normalized.entryKinds).toEqual([
      'section',
      'header',
      'item',
      'item',
    ]);
    expect(normalized.entryIds).toEqual([
      'favorites',
      'favorites',
      'blue',
      'green',
    ]);
    expect(normalized.collectionIds).toEqual([
      'favorites',
      'favorites',
      'favorites',
      'favorites',
    ]);
    expect(normalized.order).toEqual([
      { sectionId: 'favorites', itemIds: ['blue', 'green'] },
    ]);
    expect(
      normalized.children.map(
        (child) =>
          (child.props as ViewProps & { entryIdentifier: string })
            .entryIdentifier
      )
    ).toEqual([
      'section:favorites',
      'header:favorites',
      'item:blue',
      'item:green',
    ]);
  });

  it('rejects invalid nesting and duplicate ids', () => {
    expect(() =>
      normalizeReorderableChildren(
        <ReorderableItem id="">
          <View />
        </ReorderableItem>,
        reorderMarkers
      )
    ).toThrow('non-empty string');

    expect(() =>
      normalizeReorderableChildren(
        <>
          <ReorderableItem id="duplicate">
            <View />
          </ReorderableItem>
          <ReorderableItem id="duplicate">
            <View />
          </ReorderableItem>
        </>,
        reorderMarkers
      )
    ).toThrow('Duplicate item id');

    expect(() =>
      normalizeReorderableChildren(
        <ReorderableSection id="section">
          <Text>Invalid direct child</Text>
        </ReorderableSection>,
        reorderMarkers
      )
    ).toThrow('may only contain ReorderableItem');

    expect(() =>
      normalizeReorderableChildren(
        <ReorderableSection id="collision">
          <ReorderableItem id="collision">
            <View />
          </ReorderableItem>
        </ReorderableSection>,
        reorderMarkers
      )
    ).toThrow('Duplicate item id');
  });

  it('normalizes draggable items and user-authored drop zones', () => {
    const normalized = normalizeDragChildren(
      <>
        <DraggableItem id="blue">
          <Text>Blue</Text>
        </DraggableItem>
        <DropZone id="destination">
          <Text>Drop here</Text>
        </DropZone>
      </>,
      dragMarkers
    );

    expect(normalized.entryKinds).toEqual(['item', 'dropZone']);
    expect(normalized.entryIds).toEqual(['blue', 'destination']);
  });

  it('keeps Fabric children stable while preserving authored layout order', () => {
    const normalized = normalizeReorderableChildren(
      <>
        <ReorderableItem id="zulu">
          <View />
        </ReorderableItem>
        <ReorderableItem id="alpha">
          <View />
        </ReorderableItem>
        <ReorderableItem id="mike">
          <View />
        </ReorderableItem>
      </>,
      reorderMarkers
    );
    const nativeEntries = prepareNativeEntries(normalized);

    expect(nativeEntries.entryIds).toEqual(['alpha', 'mike', 'zulu']);
    expect(nativeEntries.orderedEntryIds).toEqual([
      'item:zulu',
      'item:alpha',
      'item:mike',
    ]);
  });
});

describe('controlled move calculation', () => {
  it('moves an item before another item and to the end', () => {
    const initial = [{ sectionId: null, itemIds: ['blue', 'green', 'yellow'] }];

    expect(applyMoveToOrder(initial, ['yellow'], null, 'green')).toEqual([
      { sectionId: null, itemIds: ['blue', 'yellow', 'green'] },
    ]);
    expect(applyMoveToOrder(initial, ['blue'], null, null)).toEqual([
      { sectionId: null, itemIds: ['green', 'yellow', 'blue'] },
    ]);
  });

  it('moves multiple ids between sections while preserving source order', () => {
    const initial = [
      { sectionId: 'favorites', itemIds: ['blue', 'green', 'yellow'] },
      { sectionId: 'others', itemIds: ['orange', 'pink'] },
    ];

    expect(
      applyMoveToOrder(initial, ['blue', 'green'], 'others', 'pink')
    ).toEqual([
      { sectionId: 'favorites', itemIds: ['yellow'] },
      { sectionId: 'others', itemIds: ['orange', 'blue', 'green', 'pink'] },
    ]);
  });

  it('returns the original order for an invalid destination', () => {
    const initial = [{ sectionId: null, itemIds: ['blue', 'green'] }];
    expect(applyMoveToOrder(initial, ['blue'], 'missing', null)).toEqual(
      initial
    );
  });
});

describe('drop event mapping', () => {
  it('maps ID-only native payloads and rejects malformed values', () => {
    expect(mapNativeDropEvent('["blue",4,"green"]', 'archive')).toEqual({
      itemIds: ['blue', 'green'],
      destinationId: 'archive',
    });
    expect(mapNativeDropEvent('not-json', 'archive')).toEqual({
      itemIds: [],
      destinationId: 'archive',
    });
  });
});

describe('unsupported platform fallback', () => {
  it('renders ordinary React Native views without changing child content', () => {
    expect(isNativeReorderingAvailable).toBe(false);
    const child = (
      <ReorderableItem id="one">
        <Text>One</Text>
      </ReorderableItem>
    );
    const reorderable = ReorderableContainer({
      children: child,
      onMove: () => undefined,
    });
    const drag = DragContainer({
      children: (
        <DropZone id="drop">
          <Text>Drop</Text>
        </DropZone>
      ),
      onDrop: () => undefined,
      selectedIds: [],
    });

    expect(reorderable.type).toBe(View);
    expect(reorderable.props.children).toBe(child);
    expect(drag.type).toBe(View);
  });
});
