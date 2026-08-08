import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { createRef } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Platform,
  Text,
  type NativeScrollEvent,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

import { ReorderableList, type ReorderableListRenderItemInfo } from '..';
import { VirtualizedReorderEngine } from '../virtualized-reorder-engine';

const items = Array.from({ length: 100 }, (_, index) => ({
  id: `item-${index}`,
  label: `Item ${index}`,
}));
const getItemLayout = (
  _data: readonly (typeof items)[number][],
  index: number
) => ({ index, length: 50, offset: index * 50 });

describe('ReorderableList component contract', () => {
  it('retains the FlatList viewport, safe props, callbacks, and typed ref', async () => {
    const ref = createRef<FlatList<(typeof items)[number]>>();
    const onScroll = jest.fn();
    const onLayout = jest.fn();
    const onReorder = jest.fn();
    const renderItem = jest.fn(
      ({ item }: ReorderableListRenderItemInfo<(typeof items)[number]>) => (
        <Text>{item.label}</Text>
      )
    );
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableList
          data={items}
          getItemLayout={getItemLayout}
          initialNumToRender={4}
          keyExtractor={(item) => item.id}
          onLayout={onLayout}
          onReorder={onReorder}
          onScroll={onScroll}
          ref={ref}
          renderItem={renderItem}
          testID="scale-list"
          windowSize={3}
        />
      </GestureHandlerRootView>
    );

    expect(rendered.getByTestId('scale-list')).toBeOnTheScreen();
    expect(ref.current).not.toBeNull();
    await fireEvent(rendered.getByTestId('scale-list'), 'layout', {
      nativeEvent: { layout: { height: 200, width: 300, x: 0, y: 0 } },
    });
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reorderable-list-viewport'), [
        { state: State.BEGAN, y: 25 },
        { state: State.ACTIVE, y: 25 },
        { state: State.ACTIVE, y: 155 },
        { state: State.END, y: 155 },
      ]);
    });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0]?.[0]).toMatchObject({
      sourceIds: ['item-0'],
      destination: { sectionId: null, beforeId: 'item-3' },
    });
    await fireEvent.scroll(rendered.getByTestId('scale-list'), {
      nativeEvent: { contentOffset: { x: 0, y: 50 } } as NativeScrollEvent,
    });
    expect(onLayout).toHaveBeenCalledTimes(1);
    expect(onScroll).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it.each<[string, unknown]>([
    ['CellRendererComponent', () => null],
    ['maintainVisibleContentPosition', { minIndexForVisible: 0 }],
    ['renderScrollComponent', () => null],
    ['horizontal', true],
    ['inverted', true],
    ['numColumns', 2],
  ])('rejects reserved or unsupported untyped %s', (name, value) => {
    const props = {
      data: items,
      getItemLayout,
      keyExtractor: (item: (typeof items)[number]) => item.id,
      onReorder: jest.fn(),
      renderItem: ({
        item,
      }: ReorderableListRenderItemInfo<(typeof items)[number]>) => (
        <Text>{item.label}</Text>
      ),
      [name]: value,
    };
    expect(() => ReorderableList(props as never)).toThrow('ReorderableList');
  });

  it('leaves a pre-activation drag available to ordinary list scrolling', async () => {
    const onReorder = jest.fn();
    const onScroll = jest.fn();
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableList
          data={items}
          getItemLayout={getItemLayout}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          onScroll={onScroll}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          testID="scrollable-list"
        />
      </GestureHandlerRootView>
    );

    await act(async () => {
      fireGestureHandler(getByGestureTestId('reorderable-list-viewport'), [
        { state: State.BEGAN, y: 25 },
        { state: State.FAILED, y: 50 },
      ]);
    });
    await fireEvent.scroll(rendered.getByTestId('scrollable-list'), {
      nativeEvent: { contentOffset: { x: 0, y: 50 } } as NativeScrollEvent,
    });

    expect(onReorder).not.toHaveBeenCalled();
    expect(onScroll).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it('adapts a uniform fallback estimate from mounted cell measurement', async () => {
    const onReorder = jest.fn();
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableList
          data={items}
          estimatedItemSize={100}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          testID="measured-list"
        />
      </GestureHandlerRootView>
    );
    await fireEvent(rendered.getByTestId('measured-list'), 'layout', {
      nativeEvent: { layout: { height: 200, width: 300, x: 0, y: 0 } },
    });
    await fireEvent(
      rendered.getByTestId('reorderable-list-wrapper-item-0'),
      'layout',
      { nativeEvent: { layout: { height: 50, width: 300, x: 0, y: 0 } } }
    );
    await rendered.rerender(
      <GestureHandlerRootView>
        <ReorderableList
          data={[...items]}
          estimatedItemSize={100}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          testID="measured-list"
        />
      </GestureHandlerRootView>
    );
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reorderable-list-viewport'), [
        { state: State.BEGAN, y: 25 },
        { state: State.ACTIVE, y: 25 },
        { state: State.END, y: 155 },
      ]);
    });

    const event = onReorder.mock.calls[0]?.[0] as
      | {
          destination: { beforeId: string | null };
        }
      | undefined;
    // Only mounted rows are corrected; unmounted rows retain the caller estimate.
    expect(event?.destination.beforeId).toBe('item-2');
    await rendered.unmount();
  });

  it('remaps measured geometry for the valid __proto__ identity', async () => {
    const onReorder = jest.fn();
    const prototypeItems = [
      { id: '__proto__', label: 'Prototype' },
      { id: 'next', label: 'Next' },
      { id: 'last', label: 'Last' },
    ];
    const list = (data: typeof prototypeItems) => (
      <GestureHandlerRootView>
        <ReorderableList
          data={data}
          estimatedItemSize={100}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          testID="prototype-list"
        />
      </GestureHandlerRootView>
    );
    const rendered = await render(list(prototypeItems));
    await fireEvent(rendered.getByTestId('prototype-list'), 'layout', {
      nativeEvent: { layout: { height: 300, width: 300, x: 0, y: 0 } },
    });
    await fireEvent(
      rendered.getByTestId('reorderable-list-wrapper-__proto__'),
      'layout',
      { nativeEvent: { layout: { height: 20, width: 300, x: 0, y: 0 } } }
    );
    await rendered.rerender(
      list([prototypeItems[1]!, prototypeItems[0]!, prototypeItems[2]!])
    );
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reorderable-list-viewport'), [
        { state: State.BEGAN, y: 110 },
        { state: State.ACTIVE, y: 110 },
        { state: State.END, y: 180 },
      ]);
    });

    const event = onReorder.mock.calls[0]?.[0] as
      | {
          destination: { beforeId: string | null };
        }
      | undefined;
    expect(event?.destination.beforeId).toBeNull();
    await rendered.unmount();
  });

  it('atomically clears active UI and clock when data removes the source', async () => {
    const props = {
      getItemLayout,
      keyExtractor: (item: (typeof items)[number]) => item.id,
      onReorder: jest.fn(),
      renderItem: ({
        item,
      }: ReorderableListRenderItemInfo<(typeof items)[number]>) => (
        <Text>{item.label}</Text>
      ),
      testID: 'terminal-list',
    };
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableList {...props} data={items} />
      </GestureHandlerRootView>
    );
    await fireEvent(rendered.getByTestId('terminal-list'), 'layout', {
      nativeEvent: { layout: { height: 200, width: 300, x: 0, y: 0 } },
    });
    await act(async () => {
      const handler = getByGestureTestId(
        'reorderable-list-viewport'
      ) as unknown as {
        handlers: { onStart?: (event: { y: number }) => void };
      };
      handler.handlers.onStart?.({ y: 25 });
    });
    expect(
      rendered.getByTestId('reorderable-list-destination-feedback')
    ).toBeOnTheScreen();

    await rendered.rerender(
      <GestureHandlerRootView>
        <ReorderableList {...props} data={items.slice(1)} />
      </GestureHandlerRootView>
    );
    expect(props.onReorder).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  it('composes semantic list-cell accessibility actions and announcements', async () => {
    const onReorder = jest.fn();
    const onAppAction = jest.fn();
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableList
          accessibilityStrings={{ moveLaterAction: 'Move down' }}
          data={items.slice(0, 3)}
          getItemLayout={getItemLayout}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={({ item }) => (
            <Text
              accessibilityActions={[{ name: 'favorite', label: 'Favorite' }]}
              accessibilityLabel={item.label}
              onAccessibilityAction={onAppAction}
            >
              {item.label}
            </Text>
          )}
        />
      </GestureHandlerRootView>
    );
    const first = rendered.getByTestId('reorderable-list-wrapper-item-0');
    expect(first.props.accessibilityActions).toEqual([
      { name: 'favorite', label: 'Favorite' },
      { name: 'reorder-move-later', label: 'Move down' },
    ]);
    await fireEvent(first, 'accessibilityAction', {
      nativeEvent: { actionName: 'reorder-move-later' },
    });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Moved item to position 2 of 3.');
    announce.mockRestore();
    await rendered.unmount();
  });

  it('keeps semantic actions on a library host for custom row components', async () => {
    const CustomRow = ({ label }: { label: string }) => (
      <Text accessibilityLabel={label}>{label}</Text>
    );
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableList
          data={items.slice(0, 3)}
          getItemLayout={getItemLayout}
          keyExtractor={(item) => item.id}
          onReorder={jest.fn()}
          renderItem={({ item }) => <CustomRow label={item.label} />}
        />
      </GestureHandlerRootView>
    );

    expect(
      rendered.getByTestId('reorderable-list-wrapper-item-0').props
        .accessibilityActions
    ).toEqual([{ name: 'reorder-move-later', label: 'Move later' }]);
    await rendered.unmount();
  });

  it('rejects queued accessible moves after the list becomes disabled', async () => {
    const onReorder = jest.fn();
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    const list = (enabled: boolean) => (
      <GestureHandlerRootView>
        <ReorderableList
          data={items.slice(0, 3)}
          enabled={enabled}
          getItemLayout={getItemLayout}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={({ item }) => (
            <Text accessibilityLabel={item.label}>{item.label}</Text>
          )}
        />
      </GestureHandlerRootView>
    );
    const rendered = await render(list(true));
    const staleHandler = rendered.getByTestId('reorderable-list-wrapper-item-0')
      .props.onAccessibilityAction;
    await rendered.rerender(list(false));
    expect(
      rendered.getByTestId('reorderable-list-wrapper-item-0').props
        .accessibilityActions
    ).toEqual([]);
    await act(async () => {
      staleHandler({ nativeEvent: { actionName: 'reorder-move-later' } });
    });
    expect(onReorder).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith(
      'This action is no longer available.'
    );
    announce.mockRestore();
    await rendered.unmount();
  });

  it('announces when application order corrects an accessible commit', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    const props = {
      data: items.slice(0, 3),
      getItemLayout,
      keyExtractor: (item: (typeof items)[number]) => item.id,
      onReorder: jest.fn(),
      renderItem: ({
        item,
      }: ReorderableListRenderItemInfo<(typeof items)[number]>) => (
        <Text accessibilityLabel={item.label}>{item.label}</Text>
      ),
    };
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableList {...props} />
      </GestureHandlerRootView>
    );
    await fireEvent(
      rendered.getByTestId('reorderable-list-wrapper-item-0'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'reorder-move-later' } }
    );
    await rendered.rerender(
      <GestureHandlerRootView>
        <ReorderableList {...props} />
      </GestureHandlerRootView>
    );

    expect(announce).toHaveBeenLastCalledWith('Order updated.');
    announce.mockRestore();
    await rendered.unmount();
  });

  it('never leaves an enabled unsupported-platform list inert', () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'web',
    });
    try {
      expect(() =>
        ReorderableList({
          data: items,
          getItemLayout,
          keyExtractor: (item) => item.id,
          onReorder: jest.fn(),
          renderItem: ({ item }) => <Text>{item.label}</Text>,
        })
      ).toThrow('No reorder engine can fulfill');
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalOS,
      });
    }
  });
});

describe('virtualized reorder engine contract', () => {
  it('uses exact geometry and identities to traverse several viewports', () => {
    const onCommit =
      jest.fn<
        (commit: {
          sourceIds: readonly string[];
          destination: { sectionId: string | null; beforeId: string | null };
        }) => void
      >();
    const engine = new VirtualizedReorderEngine({
      itemIds: items.map((item) => item.id),
      layouts: items.map((_item, index) => getItemLayout(items, index)),
      onCommit,
    });
    engine.setViewport(200, 0);
    engine.start('item-0', []);
    engine.move(190);
    for (let frame = 0; frame < 180; frame += 1) engine.autoScrollTick(16);

    const active = engine.snapshot();
    expect(active.scrollOffset).toBeGreaterThan(1000);
    expect(active.destination?.beforeId).toBe('item-25');
    expect(active.feedbackViewportY).toBeGreaterThanOrEqual(0);
    expect(active.feedbackViewportY).toBeLessThanOrEqual(200);

    engine.finish(true);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({
      sourceIds: ['item-0'],
      destination: { sectionId: null, beforeId: 'item-25' },
    });
    engine.finish(true);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('keeps a 10k exact-geometry identity model deterministic', () => {
    const scaleItems = Array.from({ length: 10_000 }, (_, index) => ({
      id: `scale-${index}`,
    }));
    const onCommit = jest.fn();
    const engine = new VirtualizedReorderEngine({
      itemIds: scaleItems.map((item) => item.id),
      layouts: scaleItems.map((_item, index) => ({
        index,
        length: 50,
        offset: index * 50,
      })),
      onCommit,
    });
    engine.setViewport(500, 0);
    engine.start('scale-9', []);
    engine.move(490);
    for (let frame = 0; frame < 600; frame += 1) engine.autoScrollTick(16);
    engine.finish(true);

    expect(onCommit).toHaveBeenCalledTimes(1);
    const commit = onCommit.mock.calls[0]?.[0] as
      | {
          sourceIds: readonly string[];
          destination: { beforeId: string | null };
        }
      | undefined;
    expect(commit?.sourceIds).toEqual(['scale-9']);
    expect(commit?.destination.beforeId).toMatch(/^scale-\d+$/);
  });

  it('stops auto-scroll at boundaries and every cancellation terminal', () => {
    const onCommit = jest.fn();
    const engine = new VirtualizedReorderEngine({
      itemIds: items.map((item) => item.id),
      layouts: items.map((_item, index) => getItemLayout(items, index)),
      onCommit,
    });
    engine.setViewport(200, 0);
    engine.start('item-98', []);
    engine.move(190);
    for (let frame = 0; frame < 2000; frame += 1) engine.autoScrollTick(16);
    expect(engine.snapshot().scrollOffset).toBe(4800);
    expect(engine.snapshot().autoScrollVelocity).toBe(0);

    engine.cancel();
    expect(engine.snapshot().active).toBe(false);
    expect(engine.autoScrollTick(1000)).toBe(false);
    engine.finish(true);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('moves the canonical selection and cancels when identity becomes stale', () => {
    const onCommit =
      jest.fn<
        (commit: {
          sourceIds: readonly string[];
          destination: { sectionId: string | null; beforeId: string | null };
        }) => void
      >();
    const engine = new VirtualizedReorderEngine({
      itemIds: items.map((item) => item.id),
      layouts: items.map((_item, index) => getItemLayout(items, index)),
      onCommit,
    });
    engine.setViewport(200, 0);
    engine.start('item-2', ['item-4', 'item-2', 'missing', 'item-4']);
    engine.move(160);
    engine.finish(true);
    expect(onCommit.mock.calls[0]?.[0].sourceIds).toEqual(['item-2', 'item-4']);

    engine.start('item-2', []);
    const reordered = [items[1]!, items[0]!, ...items.slice(2)];
    engine.updateGeometry(
      reordered.map((item) => item.id),
      reordered.map((_item, index) => ({
        index,
        length: 50,
        offset: index * 50,
      }))
    );
    expect(engine.snapshot().active).toBe(true);
    expect(engine.snapshot().sourceIds).toEqual(['item-2']);
    engine.updateGeometry(
      items.slice(3).map((item) => item.id),
      items.slice(3).map((_item, index) => ({
        index,
        length: 50,
        offset: index * 50,
      }))
    );
    expect(engine.snapshot().active).toBe(false);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
