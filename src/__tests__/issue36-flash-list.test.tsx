import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

const mockFlashListRender = jest.fn();
const mockScrollToIndex = jest.fn(
  async (_params: { animated?: boolean; index: number }) => undefined
);

jest.mock('@shopify/flash-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative =
    jest.requireActual<typeof import('react-native')>('react-native');
  const FlashList = React.forwardRef(
    (props: Record<string, unknown>, ref: React.ForwardedRef<unknown>) => {
      const scrollRef = React.useRef<unknown>(null);
      const imperativeRef = React.useMemo(
        () => ({
          flashScrollIndicators: jest.fn(),
          getNativeScrollRef: () => scrollRef.current,
          scrollToEnd: jest.fn(),
          scrollToIndex: mockScrollToIndex,
          scrollToItem: jest.fn(),
          scrollToOffset: jest.fn(),
        }),
        []
      );
      React.useImperativeHandle(ref, () => imperativeRef, [imperativeRef]);
      mockFlashListRender(props);
      const RenderScroll = props.renderScrollComponent as
        React.ComponentType<Record<string, unknown>> | undefined;
      const content = (props.data as readonly unknown[] | undefined)?.map(
        (item, index) =>
          React.createElement(
            React.Fragment,
            { key: (props.keyExtractor as Function)(item, index) },
            (props.renderItem as Function)({
              extraData: props.extraData,
              index,
              item,
              target: 'Cell',
            })
          )
      );
      if (RenderScroll != null)
        return React.createElement(
          RenderScroll,
          {
            onLayout: props.onLayout,
            onScroll: props.onScroll,
            ref: scrollRef,
            testID: props.testID,
          },
          content
        );
      return React.createElement(
        ReactNative.ScrollView as React.ComponentType<Record<string, unknown>>,
        {
          onLayout: props.onLayout,
          onScroll: props.onScroll,
          ref: scrollRef,
          testID: props.testID,
        } as Record<string, unknown>,
        content
      );
    }
  );
  return { FlashList };
});

import type { FlashListRef } from '@shopify/flash-list';

import {
  ReorderableFlashList,
  ReorderableFlashSectionList,
} from '../flash-list';
import type {
  ReorderableFlashListProps,
  ReorderableFlashSectionListProps,
} from '../flash-list';
import { flashSectionViewportBridge } from '../flash-section-viewport';
import type {
  ReorderableListRenderItemInfo,
  ReorderableListSection,
} from '../types';

type Item = Readonly<{ id: string; label: string }>;
const items: readonly Item[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
];

describe('certified FlashList entrypoint', () => {
  it('exports only the two wrappers at runtime', () => {
    expect(Object.keys(require('../flash-list')).sort()).toEqual([
      'ReorderableFlashList',
      'ReorderableFlashSectionList',
    ]);
  });

  it('retains the FlashList viewport, safe props and callback, and typed ref', async () => {
    const ref = { current: null as FlashListRef<Item> | null };
    const onLoad = jest.fn();
    const onScroll = jest.fn();
    const props: ReorderableFlashListProps<Item> = {
      data: items,
      drawDistance: 321,
      getItemLayout: (_data, index) => ({
        index,
        length: 50,
        offset: index * 50,
      }),
      keyExtractor: (item) => item.id,
      onLoad,
      onReorder: jest.fn(),
      onScroll,
      ref,
      renderItem: ({ item }: ReorderableListRenderItemInfo<Item>) => (
        <Text>{item.label}</Text>
      ),
      testID: 'flash-list',
    };
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableFlashList {...props} />
      </GestureHandlerRootView>
    );
    const providerProps = mockFlashListRender.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(rendered.getByTestId('flash-list')).toBeOnTheScreen();
    expect(rendered.getByText('A')).toBeOnTheScreen();
    expect(providerProps.drawDistance).toBe(321);
    expect(providerProps.getItemLayout).toBeUndefined();
    expect(providerProps.estimatedItemSize).toBeUndefined();
    expect(providerProps.renderScrollComponent).toBeDefined();
    expect(providerProps.maintainVisibleContentPosition).toEqual({
      disabled: true,
    });
    expect(ref.current?.scrollToOffset).toEqual(expect.any(Function));
    await fireEvent.scroll(rendered.getByTestId('flash-list'), {
      nativeEvent: { contentOffset: { x: 0, y: 20 } },
    });
    expect(onScroll).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it.each([
    'CellRendererComponent',
    'horizontal',
    'inverted',
    'maintainVisibleContentPosition',
    'masonry',
    'numColumns',
    'overrideProps',
    'renderScrollComponent',
  ])('rejects the untyped reserved list prop %s', (name) => {
    expect(() =>
      ReorderableFlashList({
        data: items,
        keyExtractor: (item: Item) => item.id,
        onReorder: jest.fn(),
        renderItem: ({ item }: ReorderableListRenderItemInfo<Item>) => (
          <Text>{item.label}</Text>
        ),
        [name]: name === 'data' ? [] : false,
      } as never)
    ).toThrow(/ReorderableFlashList.*owns/);
  });

  it('keeps the section wrapper type tied to FlashList safe props', () => {
    type Section = ReorderableListSection<Item> & { title: string };
    const _props: ReorderableFlashSectionListProps<Item, Section> = {
      drawDistance: 200,
      keyExtractor: (item, _index, section) => `${section.id}:${item.id}`,
      onReorder: jest.fn(),
      renderItem: ({ item }) => <Text>{item.label}</Text>,
      sections: [{ id: 'one', title: 'One', data: items }],
    };
    expect(_props.drawDistance).toBe(200);
    expect(ReorderableFlashSectionList).toEqual(expect.any(Function));
  });

  it('uses a FlashList viewport for sections and translates viewability to application values', async () => {
    type Section = ReorderableListSection<Item> & { title: string };
    const sectionData: readonly Section[] = [
      { id: 'empty-start', title: 'Empty start', data: [] },
      { id: 'filled', title: 'Filled', data: items },
      { id: 'empty-middle', title: 'Empty middle', data: [] },
      { id: 'empty-end', title: 'Empty end', data: [] },
    ];
    const ref = { current: null as FlashListRef<unknown> | null };
    const onViewableItemsChanged = jest.fn();
    mockFlashListRender.mockClear();
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableFlashSectionList<Item, Section>
          drawDistance={444}
          keyExtractor={(item) => item.id}
          onReorder={jest.fn()}
          onViewableItemsChanged={onViewableItemsChanged}
          ref={ref}
          renderItem={({ item, index, section }) => (
            <Text>{`${section.id}:${index}:${item.label}`}</Text>
          )}
          renderSectionFooter={({ section }) => (
            <Text>{`${section.title} footer`}</Text>
          )}
          renderSectionHeader={({ section }) => <Text>{section.title}</Text>}
          sections={sectionData}
          testID="flash-sections"
        />
      </GestureHandlerRootView>
    );
    const providerProps = mockFlashListRender.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(rendered.getByTestId('flash-sections')).toBeOnTheScreen();
    expect(rendered.getByText('filled:0:A')).toBeOnTheScreen();
    expect(rendered.getByText('Empty start')).toBeOnTheScreen();
    expect(rendered.getByText('Empty end footer')).toBeOnTheScreen();
    expect(providerProps.drawDistance).toBe(444);
    expect(providerProps.sections).toBeUndefined();
    expect(providerProps.maintainVisibleContentPosition).toEqual({
      disabled: true,
    });
    expect(ref.current?.scrollToOffset).toEqual(expect.any(Function));

    mockScrollToIndex.mockClear();
    await ref.current?.scrollToIndex({ index: 0, animated: false });
    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: expect.any(Number),
      animated: false,
    });
    expect(
      (mockScrollToIndex.mock.calls[0]?.[0] as { index: number }).index
    ).toBeGreaterThan(0);

    const providerData = providerProps.data as readonly unknown[];
    const firstItemProviderIndex = flashSectionViewportBridge.itemProviderIndex(
      providerData,
      'filled',
      0
    );
    expect(firstItemProviderIndex).toBeGreaterThan(0);
    const renderItemEntry = jest.fn(() => null);
    flashSectionViewportBridge.renderEntry(
      providerData[firstItemProviderIndex],
      {
        renderChrome: jest.fn(() => null),
        renderItem: renderItemEntry,
        renderItemSeparator: jest.fn(() => null),
        renderSectionSeparator: jest.fn(() => null),
      }
    );
    expect(renderItemEntry).toHaveBeenCalledWith({
      item: items[0],
      itemIndex: 0,
      section: sectionData[1],
    });
    const providerViewability = providerProps.onViewableItemsChanged as (
      info: Record<string, unknown>
    ) => void;
    providerViewability({
      changed: providerData.map((item, index) => ({
        index,
        isViewable: true,
        item,
        key: (providerProps.keyExtractor as Function)(item, index),
        timestamp: 1,
      })),
      viewableItems: providerData.map((item, index) => ({
        index,
        isViewable: true,
        item,
        key: (providerProps.keyExtractor as Function)(item, index),
        timestamp: 1,
      })),
    });
    const visible = onViewableItemsChanged.mock.calls[0]?.[0] as {
      viewableItems: readonly {
        item: unknown;
        key: string;
        section?: unknown;
      }[];
    };
    expect(visible.viewableItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item: items[0], section: sectionData[1] }),
        expect.objectContaining({ item: items[1], section: sectionData[1] }),
      ])
    );
    expect(visible.viewableItems.map((token) => token.key)).toEqual(['a', 'b']);
    await rendered.unmount();
  });

  it('commits canonical selected moves through both provider adapters', async () => {
    const selectedItems = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
    ] as const;
    const listReorder = jest.fn();
    const list = await render(
      <GestureHandlerRootView>
        <ReorderableFlashList
          data={selectedItems}
          getItemLayout={(_data, index) => ({
            index,
            length: 50,
            offset: index * 50,
          })}
          keyExtractor={(item) => item.id}
          onReorder={listReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          selectedIds={['b', 'a', 'missing', 'b']}
        />
      </GestureHandlerRootView>
    );
    await fireEvent(
      list.getByTestId('reorderable-list-wrapper-b'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'reorder-move-later' } }
    );
    expect(listReorder).toHaveBeenCalledTimes(1);
    expect(listReorder.mock.calls[0]?.[0]).toMatchObject({
      sourceIds: ['a', 'b'],
    });
    await list.unmount();

    const sectionReorder = jest.fn();
    const section = await render(
      <GestureHandlerRootView>
        <ReorderableFlashSectionList<Item, ReorderableListSection<Item>>
          estimatedItemSize={50}
          keyExtractor={(item) => item.id}
          onReorder={sectionReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          sections={[{ id: 'one', data: selectedItems }]}
          selectedIds={['b', 'a', 'missing', 'b']}
        />
      </GestureHandlerRootView>
    );
    await fireEvent(
      section.getByTestId('reorderable-section-list-wrapper-b'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'reorder-move-later' } }
    );
    expect(sectionReorder).toHaveBeenCalledTimes(1);
    expect(sectionReorder.mock.calls[0]?.[0]).toMatchObject({
      sourceIds: ['a', 'b'],
    });
    await section.unmount();
  });

  it('cancels active interactions when either provider adapter is disabled', async () => {
    const listReorder = jest.fn();
    const renderList = (enabled: boolean) => (
      <GestureHandlerRootView>
        <ReorderableFlashList
          data={items}
          enabled={enabled}
          estimatedItemSize={50}
          keyExtractor={(item) => item.id}
          onReorder={listReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          testID="cancel-flash-list"
        />
      </GestureHandlerRootView>
    );
    const list = await render(renderList(true));
    await fireEvent(list.getByTestId('cancel-flash-list'), 'layout', {
      nativeEvent: { layout: { height: 100, width: 300, x: 0, y: 0 } },
    });
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reorderable-list-viewport'), [
        { state: State.BEGAN, y: 25 },
        { state: State.ACTIVE, y: 25 },
      ]);
    });
    await list.rerender(renderList(false));
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reorderable-list-viewport'), [
        { state: State.END, y: 75 },
      ]);
    });
    expect(listReorder).not.toHaveBeenCalled();
    await list.unmount();

    const sectionReorder = jest.fn();
    const renderSection = (enabled: boolean) => (
      <GestureHandlerRootView>
        <ReorderableFlashSectionList<Item, ReorderableListSection<Item>>
          enabled={enabled}
          estimatedItemSize={50}
          keyExtractor={(item) => item.id}
          onReorder={sectionReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          sections={[{ id: 'one', data: items }]}
          testID="cancel-flash-section-list"
        />
      </GestureHandlerRootView>
    );
    const section = await render(renderSection(true));
    await fireEvent(
      section.getByTestId('cancel-flash-section-list'),
      'layout',
      {
        nativeEvent: { layout: { height: 100, width: 300, x: 0, y: 0 } },
      }
    );
    await act(async () => {
      fireGestureHandler(
        getByGestureTestId('reorderable-section-list-viewport'),
        [
          { state: State.BEGAN, y: 25 },
          { state: State.ACTIVE, y: 25 },
        ]
      );
    });
    await section.rerender(renderSection(false));
    await act(async () => {
      fireGestureHandler(
        getByGestureTestId('reorderable-section-list-viewport'),
        [{ state: State.END, y: 75 }]
      );
    });
    expect(sectionReorder).not.toHaveBeenCalled();
    await section.unmount();
  });

  it('keeps repeated primitive section rows distinct by application identity', async () => {
    type Section = ReorderableListSection<number>;
    const onViewableItemsChanged = jest.fn();
    mockFlashListRender.mockClear();
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableFlashSectionList<number, Section>
          keyExtractor={(_item, index, section) => `${section.id}:${index}`}
          onReorder={jest.fn()}
          onViewableItemsChanged={onViewableItemsChanged}
          renderItem={({ item, index, section }) => (
            <Text>{`${section.id}:${index}:${item}`}</Text>
          )}
          sections={[
            { id: 'left', data: [7, 7] },
            { id: 'empty', data: [] },
            { id: 'right', data: [7] },
          ]}
        />
      </GestureHandlerRootView>
    );
    const providerProps = mockFlashListRender.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    const providerData = providerProps.data as readonly unknown[];
    (providerProps.onViewableItemsChanged as Function)({
      changed: providerData.map((item, index) => ({
        index,
        isViewable: true,
        item,
        key: String(index),
      })),
      viewableItems: providerData.map((item, index) => ({
        index,
        isViewable: true,
        item,
        key: String(index),
      })),
    });
    expect(
      (
        onViewableItemsChanged.mock.calls[0]?.[0] as {
          viewableItems: readonly { index: number; item: number }[];
        }
      ).viewableItems.map(({ index, item }) => [index, item])
    ).toEqual([
      [0, 7],
      [1, 7],
      [0, 7],
    ]);
    await rendered.unmount();
  });
});
