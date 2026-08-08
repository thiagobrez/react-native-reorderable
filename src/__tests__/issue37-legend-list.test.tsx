import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

const mockLegendListRender = jest.fn();
const mockLegendSectionListRender = jest.fn();
const mockScrollToIndex = jest.fn(async () => undefined);

function MockLegendViewport({
  children,
  forwardedRef,
  reactModule: React,
  reactNativeModule: ReactNative,
  viewportProps: props,
}: {
  children: React.ReactNode;
  forwardedRef: React.ForwardedRef<unknown>;
  reactModule: typeof import('react');
  reactNativeModule: typeof import('react-native');
  viewportProps: Record<string, unknown>;
}) {
  const scrollRef = React.useRef<unknown>(null);
  const imperativeRef = React.useMemo(
    () => ({
      clearCaches: jest.fn(),
      flashScrollIndicators: jest.fn(),
      getNativeScrollRef: () => scrollRef.current,
      scrollToLocation: jest.fn(),
      scrollToEnd: jest.fn(async () => undefined),
      scrollToIndex: mockScrollToIndex,
      scrollToItem: jest.fn(async () => undefined),
      scrollToOffset: jest.fn(async () => undefined),
    }),
    []
  );
  React.useImperativeHandle(forwardedRef, () => imperativeRef, [imperativeRef]);
  const RenderScroll = props.renderScrollComponent as
    React.ComponentType<Record<string, unknown>> | undefined;
  return React.createElement(
    RenderScroll ??
      (ReactNative.ScrollView as React.ComponentType<Record<string, unknown>>),
    {
      onLayout: props.onLayout,
      onScroll: props.onScroll,
      ref: scrollRef,
      testID: props.testID,
    },
    children
  );
}

jest.mock('@legendapp/list/react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative =
    jest.requireActual<typeof import('react-native')>('react-native');
  const LegendList = React.forwardRef(
    (props: Record<string, unknown>, ref: React.ForwardedRef<unknown>) => {
      mockLegendListRender(props);
      const content = (props.data as readonly unknown[]).map((item, index) =>
        React.createElement(
          React.Fragment,
          { key: (props.keyExtractor as Function)(item, index) },
          (props.renderItem as Function)({ index, item })
        )
      );
      return React.createElement(MockLegendViewport, {
        children: content,
        forwardedRef: ref,
        reactModule: React,
        reactNativeModule: ReactNative,
        viewportProps: props,
      });
    }
  );
  return { LegendList };
});

jest.mock('@legendapp/list/section-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative =
    jest.requireActual<typeof import('react-native')>('react-native');
  const SectionList = React.forwardRef(
    (props: Record<string, unknown>, ref: React.ForwardedRef<unknown>) => {
      mockLegendSectionListRender(props);
      const content = (
        props.sections as readonly Record<string, unknown>[]
      ).flatMap((section, sectionIndex) => [
        React.createElement(
          React.Fragment,
          { key: `${sectionIndex}:header` },
          (props.renderSectionHeader as Function)?.({ section })
        ),
        ...(section.data as readonly unknown[]).map((item, index) =>
          React.createElement(
            React.Fragment,
            { key: `${section.id}:${index}` },
            (props.renderItem as Function)({ index, item, section })
          )
        ),
        React.createElement(
          React.Fragment,
          { key: `${sectionIndex}:footer` },
          (props.renderSectionFooter as Function)?.({ section })
        ),
      ]);
      return React.createElement(MockLegendViewport, {
        children: content,
        forwardedRef: ref,
        reactModule: React,
        reactNativeModule: ReactNative,
        viewportProps: props,
      });
    }
  );
  return { SectionList };
});

import type { LegendListRef } from '@legendapp/list/react-native';
import type { SectionListRef as LegendSectionListRef } from '@legendapp/list/section-list';
import {
  ReorderableLegendList,
  ReorderableLegendSectionList,
} from '../legend-list';
import type {
  ReorderableLegendListProps,
  ReorderableLegendSectionListProps,
} from '../legend-list';
import type {
  ReorderableListRenderItemInfo,
  ReorderableListSection,
} from '../types';

type Item = Readonly<{ id: string; label: string }>;
const items: readonly Item[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
];

describe('certified Legend List entrypoint', () => {
  it('exports only the two frozen wrappers at runtime', () => {
    expect(Object.keys(require('../legend-list')).sort()).toEqual([
      'ReorderableLegendList',
      'ReorderableLegendSectionList',
    ]);
  });

  it('retains the Legend List viewport, safe props, callbacks, and typed ref', async () => {
    const ref = { current: null as LegendListRef | null };
    const onScroll = jest.fn();
    const props: ReorderableLegendListProps<Item> = {
      data: items,
      drawDistance: 321,
      estimatedItemSize: 48,
      keyExtractor: (item) => item.id,
      onReorder: jest.fn(),
      onScroll,
      ref,
      renderItem: ({ item }: ReorderableListRenderItemInfo<Item>) => (
        <Text>{item.label}</Text>
      ),
      recycleItems: true,
      testID: 'legend-list',
    };
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableLegendList {...props} />
      </GestureHandlerRootView>
    );
    const providerProps = mockLegendListRender.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(rendered.getByText('A')).toBeOnTheScreen();
    expect(providerProps).toMatchObject({
      drawDistance: 321,
      estimatedItemSize: 48,
      maintainVisibleContentPosition: false,
      recycleItems: true,
    });
    expect(providerProps.renderScrollComponent).toEqual(expect.any(Function));
    const providerScrollRef = jest.fn();
    const ownedScroll = (providerProps.renderScrollComponent as Function)({
      ref: providerScrollRef,
    }) as React.ReactElement<{ ref: typeof providerScrollRef }>;
    expect(ownedScroll.props.ref).toBe(providerScrollRef);
    expect(ref.current?.clearCaches).toEqual(expect.any(Function));
    await fireEvent.scroll(rendered.getByTestId('legend-list'), {
      nativeEvent: { contentOffset: { x: 0, y: 20 } },
    });
    expect(onScroll).toHaveBeenCalledTimes(1);
  });

  it('translates exact portable row lengths to Legend List fixed-size hints', async () => {
    await render(
      <GestureHandlerRootView>
        <ReorderableLegendList
          data={items}
          getItemLayout={(_data, index) => ({
            index,
            length: 40 + index * 10,
            offset: index === 0 ? 0 : 40,
          })}
          keyExtractor={(item) => item.id}
          onReorder={jest.fn()}
          renderItem={({ item }) => <Text>{item.label}</Text>}
        />
      </GestureHandlerRootView>
    );
    const providerProps = mockLegendListRender.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(providerProps.getItemLayout).toBeUndefined();
    expect((providerProps.getFixedItemSize as Function)(items[1], 1, '')).toBe(
      50
    );
  });

  it.each([
    'CellRendererComponent',
    'children',
    'getFixedItemSize',
    'getItemType',
    'horizontal',
    'inverted',
    'maintainVisibleContentPosition',
    'numColumns',
    'refScrollView',
    'renderScrollComponent',
  ])('rejects the untyped reserved list prop %s descriptively', (name) => {
    expect(() =>
      ReorderableLegendList({
        data: items,
        keyExtractor: (item: Item) => item.id,
        onReorder: jest.fn(),
        renderItem: ({ item }: ReorderableListRenderItemInfo<Item>) => (
          <Text>{item.label}</Text>
        ),
        [name]: false,
      } as never)
    ).toThrow(/ReorderableLegendList|ReorderableList/);
  });

  it('uses Legend SectionList directly with safe props, empty sections, and its typed ref', async () => {
    type Section = ReorderableListSection<Item> & { title: string };
    const sections: readonly Section[] = [
      { id: 'empty', title: 'Empty', data: [] },
      { id: 'filled', title: 'Filled', data: items },
    ];
    const ref = { current: null as LegendSectionListRef | null };
    const onViewableItemsChanged = jest.fn();
    const props: ReorderableLegendSectionListProps<Item, Section> = {
      drawDistance: 444,
      estimatedItemSize: 52,
      keyExtractor: (item) => item.id,
      onReorder: jest.fn(),
      onViewableItemsChanged,
      ref,
      renderItem: ({ item, section }) => (
        <Text>{`${section.id}:${item.label}`}</Text>
      ),
      renderSectionHeader: ({ section }) => <Text>{section.title}</Text>,
      sections,
      testID: 'legend-sections',
    };
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableLegendSectionList {...props} />
      </GestureHandlerRootView>
    );
    const providerProps = mockLegendSectionListRender.mock.calls.at(
      -1
    )?.[0] as Record<string, unknown>;
    expect(rendered.getByText('Empty')).toBeOnTheScreen();
    expect(rendered.getByText('filled:A')).toBeOnTheScreen();
    expect(providerProps).toMatchObject({
      drawDistance: 444,
      estimatedItemSize: 52,
      maintainVisibleContentPosition: false,
    });
    expect(ref.current?.scrollToLocation).toEqual(expect.any(Function));
    const providerSection = (providerProps.sections as readonly Section[])[1]!;
    (providerProps.onViewableItemsChanged as Function)({
      changed: [
        {
          index: 0,
          isViewable: true,
          item: providerSection.data[0],
          key: 'a',
          section: providerSection,
        },
      ],
      end: 6,
      endBuffered: 8,
      start: 2,
      startBuffered: 1,
      viewableItems: [
        {
          index: 0,
          isViewable: true,
          item: providerSection.data[0],
          key: 'a',
          section: providerSection,
        },
      ],
    });
    expect(onViewableItemsChanged).toHaveBeenCalledWith({
      changed: [
        expect.objectContaining({ item: items[0], section: sections[1] }),
      ],
      end: 6,
      endBuffered: 8,
      start: 2,
      startBuffered: 1,
      viewableItems: [
        expect.objectContaining({ item: items[0], section: sections[1] }),
      ],
    });
  });

  it('translates only exact section item lengths and owns Legend section internals', async () => {
    type Section = ReorderableListSection<Item>;
    const sections: readonly Section[] = [{ id: 'one', data: items }];
    await render(
      <GestureHandlerRootView>
        <ReorderableLegendSectionList<Item, Section>
          getItemLayout={(_sections, _sectionIndex, itemIndex) => ({
            length: 45 + itemIndex * 5,
            offset: itemIndex === 0 ? 20 : 65,
          })}
          keyExtractor={(item) => item.id}
          onReorder={jest.fn()}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          renderSectionHeader={() => <Text>Header</Text>}
          sections={sections}
        />
      </GestureHandlerRootView>
    );
    const providerProps = mockLegendSectionListRender.mock.calls.at(
      -1
    )?.[0] as Record<string, unknown>;
    const fixedSize = providerProps.getFixedItemSize as Function;
    const providerSections = providerProps.sections as readonly Section[];
    expect(
      fixedSize({ index: 1, section: providerSections[0], type: 'item' })
    ).toBe(50);
    expect(
      fixedSize({ section: providerSections[0], type: 'header' })
    ).toBeUndefined();
  });

  it.each([
    'CellRendererComponent',
    'children',
    'getFixedItemSize',
    'getItemType',
    'horizontal',
    'inverted',
    'itemsAreEqual',
    'maintainVisibleContentPosition',
    'numColumns',
    'onFirstVisibleItemChanged',
    'onItemSizeChanged',
    'onStickyHeaderChange',
    'overrideItemLayout',
    'refScrollView',
    'renderScrollComponent',
    'viewabilityConfigCallbackPairs',
  ])('rejects the untyped reserved section prop %s descriptively', (name) => {
    expect(() =>
      ReorderableLegendSectionList({
        keyExtractor: (item: Item) => item.id,
        onReorder: jest.fn(),
        renderItem: ({ item }: { item: Item }) => <Text>{item.label}</Text>,
        sections: [{ id: 'one', data: items }],
        [name]: false,
      } as never)
    ).toThrow(/ReorderableLegendSectionList|ReorderableSectionList/);
  });

  it('commits canonical selected moves through both Legend providers', async () => {
    const selectedItems = [
      ...items,
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
    ] as const;
    const onListReorder = jest.fn();
    const list = await render(
      <GestureHandlerRootView>
        <ReorderableLegendList
          data={selectedItems}
          keyExtractor={(item) => item.id}
          onReorder={onListReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          selectedIds={['b', 'a', 'missing', 'b']}
        />
      </GestureHandlerRootView>
    );
    await fireEvent(
      list.getByTestId('reorderable-list-wrapper-a'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'reorder-move-later' } }
    );
    expect(onListReorder).toHaveBeenCalledWith(
      expect.objectContaining({ sourceIds: ['a', 'b'] })
    );
    await list.unmount();

    const onSectionReorder = jest.fn();
    const section = await render(
      <GestureHandlerRootView>
        <ReorderableLegendSectionList
          keyExtractor={(item: Item) => item.id}
          onReorder={onSectionReorder}
          renderItem={({ item }: { item: Item }) => <Text>{item.label}</Text>}
          sections={[{ id: 'one', data: selectedItems }]}
          selectedIds={['b', 'a', 'missing', 'b']}
        />
      </GestureHandlerRootView>
    );
    await fireEvent(
      section.getByTestId('reorderable-section-list-wrapper-a'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'reorder-move-later' } }
    );
    expect(onSectionReorder).toHaveBeenCalledWith(
      expect.objectContaining({ sourceIds: ['a', 'b'] })
    );
  });

  it('uses fixed geometry for an off-window pointer destination and auto-scrolls without rerendering cells', async () => {
    const longItems = Array.from({ length: 120 }, (_unused, index) => ({
      id: `row-${index}`,
      label: `Row ${index}`,
    }));
    const onReorder = jest.fn();
    const renderItem = jest.fn(
      ({ item }: { item: (typeof longItems)[number] }) => (
        <Text>{item.label}</Text>
      )
    );
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableLegendList
          data={longItems}
          getItemLayout={(_data, index) => ({
            index,
            length: 50,
            offset: index * 50,
          })}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={renderItem}
          testID="legend-long-list"
        />
      </GestureHandlerRootView>
    );
    await fireEvent(rendered.getByTestId('legend-long-list'), 'layout', {
      nativeEvent: { layout: { height: 200, width: 300, x: 0, y: 0 } },
    });
    const rendersBeforeGesture = renderItem.mock.calls.length;
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reorderable-list-viewport'), [
        { state: State.BEGAN, y: 25 },
        { state: State.ACTIVE, y: 25 },
        { state: State.ACTIVE, y: 195 },
        { state: State.ACTIVE, y: 195 },
        { state: State.ACTIVE, y: 195 },
        { state: State.END, y: 195 },
      ]);
    });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0]?.[0]).toMatchObject({
      sourceIds: ['row-0'],
      destination: { sectionId: null },
    });
    expect(
      (onReorder.mock.calls[0]?.[0] as { destination: { beforeId: string } })
        .destination.beforeId
    ).not.toBe('row-1');
    expect(renderItem).toHaveBeenCalledTimes(rendersBeforeGesture);
  });

  it('auto-scrolls the provider-native section viewport without rerendering cells', async () => {
    const sectionItems = Array.from({ length: 120 }, (_unused, index) => ({
      id: `section-row-${index}`,
      label: `Section row ${index}`,
    }));
    const onReorder = jest.fn();
    const renderItem = jest.fn(
      ({ item }: { item: (typeof sectionItems)[number] }) => (
        <Text>{item.label}</Text>
      )
    );
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableLegendSectionList
          estimatedItemSize={50}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={renderItem}
          sections={[{ id: 'long', data: sectionItems }]}
          testID="legend-long-sections"
        />
      </GestureHandlerRootView>
    );
    await fireEvent(rendered.getByTestId('legend-long-sections'), 'layout', {
      nativeEvent: { layout: { height: 200, width: 300, x: 0, y: 0 } },
    });
    const rendersBeforeGesture = renderItem.mock.calls.length;
    await act(async () => {
      fireGestureHandler(
        getByGestureTestId('reorderable-section-list-viewport'),
        [
          { state: State.BEGAN, y: 25 },
          { state: State.ACTIVE, y: 25 },
          { state: State.ACTIVE, y: 195 },
          { state: State.ACTIVE, y: 195 },
          { state: State.ACTIVE, y: 195 },
          { state: State.END, y: 195 },
        ]
      );
    });
    expect(onReorder).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceIds: ['section-row-0'],
        destination: expect.objectContaining({ sectionId: 'long' }),
      })
    );
    expect(renderItem).toHaveBeenCalledTimes(rendersBeforeGesture);
  });

  it('uses variable measurement and permits an empty section destination', async () => {
    const onReorder = jest.fn();
    type Section = ReorderableListSection<Item>;
    const sections: readonly Section[] = [
      { id: 'first', data: [{ id: 'a', label: 'A' }] },
      { id: 'empty', data: [] },
      { id: 'last', data: [{ id: 'b', label: 'B' }] },
    ];
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableLegendSectionList<Item, Section>
          estimatedItemSize={50}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          sections={sections}
          testID="legend-empty-sections"
        />
      </GestureHandlerRootView>
    );
    await fireEvent(rendered.getByTestId('legend-empty-sections'), 'layout', {
      nativeEvent: { layout: { height: 200, width: 300, x: 0, y: 0 } },
    });
    await fireEvent(
      rendered.getByTestId('reorderable-section-list-wrapper-a'),
      'layout',
      { nativeEvent: { layout: { height: 40, width: 300, x: 0, y: 0 } } }
    );
    await fireEvent(
      rendered.getByTestId('reorderable-section-list-wrapper-a'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'reorder-move-later' } }
    );
    expect(onReorder).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceIds: ['a'],
        destination: { sectionId: 'empty', beforeId: null },
      })
    );
  });

  it('cancels active interactions when either Legend viewport is disabled', async () => {
    const listReorder = jest.fn();
    const listView = (enabled: boolean) => (
      <GestureHandlerRootView>
        <ReorderableLegendList
          data={items}
          enabled={enabled}
          estimatedItemSize={50}
          keyExtractor={(item) => item.id}
          onReorder={listReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          testID="cancel-legend-list"
        />
      </GestureHandlerRootView>
    );
    const list = await render(listView(true));
    await fireEvent(list.getByTestId('cancel-legend-list'), 'layout', {
      nativeEvent: { layout: { height: 100, width: 300, x: 0, y: 0 } },
    });
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reorderable-list-viewport'), [
        { state: State.BEGAN, y: 25 },
        { state: State.ACTIVE, y: 25 },
      ]);
    });
    await list.rerender(listView(false));
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reorderable-list-viewport'), [
        { state: State.END, y: 75 },
      ]);
    });
    expect(listReorder).not.toHaveBeenCalled();
    await list.unmount();

    const sectionReorder = jest.fn();
    const sectionView = (enabled: boolean) => (
      <GestureHandlerRootView>
        <ReorderableLegendSectionList
          enabled={enabled}
          estimatedItemSize={50}
          keyExtractor={(item: Item) => item.id}
          onReorder={sectionReorder}
          renderItem={({ item }: { item: Item }) => <Text>{item.label}</Text>}
          sections={[{ id: 'one', data: items }]}
          testID="cancel-legend-sections"
        />
      </GestureHandlerRootView>
    );
    const section = await render(sectionView(true));
    await fireEvent(section.getByTestId('cancel-legend-sections'), 'layout', {
      nativeEvent: { layout: { height: 100, width: 300, x: 0, y: 0 } },
    });
    await act(async () => {
      fireGestureHandler(
        getByGestureTestId('reorderable-section-list-viewport'),
        [
          { state: State.BEGAN, y: 25 },
          { state: State.ACTIVE, y: 25 },
        ]
      );
    });
    await section.rerender(sectionView(false));
    await act(async () => {
      fireGestureHandler(
        getByGestureTestId('reorderable-section-list-viewport'),
        [{ state: State.END, y: 75 }]
      );
    });
    expect(sectionReorder).not.toHaveBeenCalled();
  });
});
