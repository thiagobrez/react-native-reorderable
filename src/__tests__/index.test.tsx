import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { createRef, type ReactElement } from 'react';
import { Platform, Text, View, type ViewProps } from 'react-native';
import * as publicApi from '..';

import {
  DragContainer,
  DraggableItem,
  DropZone,
  ReorderableContainer,
  ReorderableItem,
  ReorderableSection,
  type ReorderEvent,
} from '..';
import {
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
    const footer = <Text>2 cards</Text>;
    const normalized = normalizeReorderableChildren(
      <ReorderableSection
        footer={footer}
        id="favorites"
        header={header}
        style={{ gap: 8 }}
      >
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
      'footer',
    ]);
    expect(normalized.entryIds).toEqual([
      'favorites',
      'favorites',
      'blue',
      'green',
      'favorites',
    ]);
    expect(normalized.collectionIds).toEqual([
      'favorites',
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
      'footer:favorites',
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

    expect(
      normalizeReorderableChildren(
        <ReorderableSection id="separate-namespace">
          <ReorderableItem id="separate-namespace">
            <View />
          </ReorderableItem>
        </ReorderableSection>,
        reorderMarkers
      ).order
    ).toEqual([
      { sectionId: 'separate-namespace', itemIds: ['separate-namespace'] },
    ]);
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

describe('drop event mapping', () => {
  it('maps ID-only native payloads and rejects malformed values atomically', () => {
    expect(mapNativeDropEvent('["blue","green"]', 'archive')).toEqual({
      itemIds: ['blue', 'green'],
      destinationId: 'archive',
    });
    expect(mapNativeDropEvent('["blue",4,"green"]', 'archive')).toEqual({
      itemIds: [],
      destinationId: 'archive',
    });
    expect(mapNativeDropEvent('not-json', 'archive')).toEqual({
      itemIds: [],
      destinationId: 'archive',
    });
  });
});

describe('public reorder component', () => {
  it('does not retain provisional reorder aliases or native availability', () => {
    expect(publicApi).not.toHaveProperty('isNativeReorderingAvailable');
    expect(publicApi).not.toHaveProperty('ReorderMove');
  });

  it('renders disabled content without requiring an interaction engine', async () => {
    const child = (
      <ReorderableItem id="one">
        <Text>One</Text>
      </ReorderableItem>
    );
    const rendered = await render(
      <ReorderableContainer enabled={false} onReorder={() => undefined}>
        {child}
      </ReorderableContainer>
    );

    expect(rendered.getByText('One')).toBeOnTheScreen();
  });

  it('forwards host-view refs through the complete children surface', async () => {
    const containerRef = createRef<React.ElementRef<typeof View>>();
    const sectionRef = createRef<React.ElementRef<typeof View>>();
    const itemRef = createRef<React.ElementRef<typeof View>>();

    await render(
      <ReorderableContainer
        enabled={false}
        onReorder={() => undefined}
        ref={containerRef}
      >
        <ReorderableSection id="section" ref={sectionRef}>
          <ReorderableItem id="one" ref={itemRef}>
            <Text>One</Text>
          </ReorderableItem>
        </ReorderableSection>
      </ReorderableContainer>
    );

    expect(containerRef.current).not.toBeNull();
    expect(sectionRef.current).not.toBeNull();
    expect(itemRef.current).not.toBeNull();
  });

  it('never leaves an enabled unsupported container inert', () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    try {
      expect(() =>
        ReorderableContainer({
          children: (
            <ReorderableItem id="one">
              <Text>One</Text>
            </ReorderableItem>
          ),
          onReorder: () => undefined,
        })
      ).toThrow('No reorder engine can fulfill the portable contract');
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalOS,
      });
    }
  });

  it('routes one native terminal identity outcome through reconciliation', async () => {
    const originalOS = Platform.OS;
    const originalVersion = Platform.Version;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 27,
    });
    const onReorder = jest.fn<(event: ReorderEvent) => void>();

    try {
      const children = (
        <>
          <ReorderableItem id="blue">
            <View />
          </ReorderableItem>
          <ReorderableItem id="green">
            <View />
          </ReorderableItem>
          <ReorderableItem id="yellow">
            <View />
          </ReorderableItem>
        </>
      );
      const rendered = await render(
        <ReorderableContainer onReorder={onReorder} testID="reorderable">
          {children}
        </ReorderableContainer>
      );

      await fireEvent(rendered.getByTestId('reorderable'), 'move', {
        nativeEvent: {
          sourceIdsJson: '["yellow"]',
          destinationCollectionId: '',
          destinationBeforeId: 'green',
        },
      });
      expect(onReorder).toHaveBeenCalledTimes(1);
      expect(onReorder).toHaveBeenLastCalledWith({
        sourceIds: ['yellow'],
        destination: { sectionId: null, beforeId: 'green' },
        nextOrder: [{ sectionId: null, itemIds: ['blue', 'yellow', 'green'] }],
      });

      await fireEvent(rendered.getByTestId('reorderable'), 'move', {
        nativeEvent: {
          sourceIdsJson: '["blue",4]',
          destinationCollectionId: '',
          destinationBeforeId: '',
        },
      });
      expect(onReorder).toHaveBeenCalledTimes(1);

      await rendered.rerender(
        <ReorderableContainer onReorder={onReorder} testID="reorderable">
          {children}
        </ReorderableContainer>
      );
      await rendered.rerender(
        <ReorderableContainer onReorder={onReorder} testID="reorderable">
          <ReorderableItem id="blue">
            <View />
          </ReorderableItem>
          <ReorderableItem id="yellow">
            <View />
          </ReorderableItem>
          <ReorderableItem id="green">
            <View />
          </ReorderableItem>
        </ReorderableContainer>
      );
      await rendered.rerender(
        <ReorderableContainer onReorder={onReorder} testID="reorderable">
          {children}
        </ReorderableContainer>
      );
      expect(onReorder).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalOS,
      });
      Object.defineProperty(Platform, 'Version', {
        configurable: true,
        value: originalVersion,
      });
    }
  });

  it('rejects a forced fallback policy until that engine is implemented', () => {
    expect(() =>
      ReorderableContainer({
        children: (
          <ReorderableItem id="one">
            <View />
          </ReorderableItem>
        ),
        engine: 'fallback',
        onReorder: () => undefined,
      })
    ).toThrow('No reorder engine can fulfill the portable contract');
  });

  it('preserves the existing drag fallback until its frozen replacement lands', () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    try {
      const drag = DragContainer({
        children: (
          <DropZone id="drop">
            <Text>Drop</Text>
          </DropZone>
        ),
        onDrop: () => undefined,
        selectedIds: [],
      });
      expect(drag.type).toBe(View);
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalOS,
      });
    }
  });
});
