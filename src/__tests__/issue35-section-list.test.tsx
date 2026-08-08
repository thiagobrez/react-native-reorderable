import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { createRef } from 'react';
import {
  AccessibilityInfo,
  Platform,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

import {
  ReorderableSectionList,
  type ReorderableListSection,
  type ReorderableSectionListRenderItemInfo,
} from '..';
import {
  applyExactChromeMeasurement,
  createSectionModel,
  createViewportSections,
  destinationAtSectionFrame,
  emptySectionDestinationAtOffset,
  remapSectionMeasurementQueue,
} from '../section-list-model';
import {
  createSectionViewportItem,
  unwrapSectionViewability,
} from '../reorderable-section-list';
import {
  applyGroupedExactMeasurement,
  applyMeasurement,
  contentLength,
  createGroupedExactGeometry,
  geometryByteLength,
  indexAtOffset,
  itemLength,
  itemOffset,
} from '../virtualized-geometry';
import type { ExactGeometry } from '../virtualized-geometry';
import {
  planSectionAutoScroll,
  resolveSectionListEngine,
  sectionAutoScrollDuration,
  stepSectionAutoScroll,
} from '../section-list-engine';
import { reconcileReorder } from '../semantic';

type Item = Readonly<{ id: string; label: string }>;
type Section = ReorderableListSection<Item> & Readonly<{ title: string }>;

const sections: readonly Section[] = [
  { id: 'empty-start', title: 'Empty start', data: [] },
  {
    id: 'one',
    title: 'One',
    data: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
  },
  { id: 'empty-middle', title: 'Empty middle', data: [] },
  { id: 'two', title: 'Two', data: [{ id: 'c', label: 'C' }] },
  { id: 'empty-end', title: 'Empty end', data: [] },
];

function exactLayout(
  _sections: readonly Section[],
  sectionIndex: number,
  itemIndex: number
) {
  const offsets = new Map([
    ['1:0', 90],
    ['1:1', 140],
    ['3:0', 290],
  ]);
  return { length: 50, offset: offsets.get(`${sectionIndex}:${itemIndex}`)! };
}

describe('ReorderableSectionList public contract', () => {
  it('retains the SectionList viewport, section render information, chrome, safe callbacks, and typed ref', async () => {
    const ref = createRef<SectionList<Item, Section>>();
    const onScroll = jest.fn();
    const onReorder = jest.fn();
    const renderItem = jest.fn(
      ({
        item,
        index,
        section,
      }: ReorderableSectionListRenderItemInfo<Item, Section>) => (
        <Text>{`${section.id}:${index}:${item.label}`}</Text>
      )
    );
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableSectionList<Item, Section>
          sections={sections}
          keyExtractor={(item: Item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => <Text>{section.title}</Text>}
          renderSectionFooter={({ section }) => (
            <Text>{`${section.id} footer`}</Text>
          )}
          getItemLayout={exactLayout}
          onReorder={onReorder}
          onScroll={onScroll}
          ref={ref}
          testID="section-list"
          windowSize={3}
        />
      </GestureHandlerRootView>
    );

    expect(rendered.getByTestId('section-list')).toBeOnTheScreen();
    expect(ref.current).not.toBeNull();
    expect(rendered.getByText('one:0:A')).toBeOnTheScreen();
    expect(rendered.getByText('Empty start')).toBeOnTheScreen();
    expect(rendered.getByText('empty-start footer')).toBeOnTheScreen();
    await fireEvent.scroll(rendered.getByTestId('section-list'), {
      nativeEvent: { contentOffset: { x: 0, y: 20 } },
    });
    expect(onScroll).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it.each<[string, unknown]>([
    ['CellRendererComponent', () => null],
    ['data', []],
    ['maintainVisibleContentPosition', { minIndexForVisible: 0 }],
    ['renderScrollComponent', () => null],
    ['horizontal', true],
    ['horizontal', false],
    ['inverted', true],
    ['inverted', false],
    ['numColumns', 2],
    ['numColumns', 1],
  ])('rejects reserved or unsupported untyped %s', (name, value) => {
    expect(() =>
      ReorderableSectionList<Item, Section>({
        sections,
        keyExtractor: (item: Item) => item.id,
        renderItem: ({
          item,
        }: ReorderableSectionListRenderItemInfo<Item, Section>) => (
          <Text>{item.label}</Text>
        ),
        onReorder: jest.fn(),
        [name]: value,
      } as never)
    ).toThrow('ReorderableSectionList');
  });

  it('installs section-owned keys for repeated primitive values without identity guessing', () => {
    type PrimitiveSection = ReorderableListSection<number>;
    const primitiveSections: readonly PrimitiveSection[] = [
      { id: 'left', data: [7] },
      { id: 'right', data: [7] },
    ];
    const viewportSections = createViewportSections(
      primitiveSections,
      (_item, index, section) => `${section.id}:${index}`
    );
    expect(viewportSections[0]!.keyExtractor(7, 0)).toBe('left:0');
    expect(viewportSections[1]!.keyExtractor(7, 0)).toBe('right:0');
  });

  it('measures every separator between repeated primitive values by its index-aware id', async () => {
    const separator = jest.fn((_props: { leadingItem?: number }) => (
      <View style={{ height: 6 }} />
    ));
    const repeated = [
      {
        id: 'repeated',
        data: [7, 7, 7],
        ItemSeparatorComponent: separator,
      },
    ] as const;
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableSectionList<
          number,
          ReorderableListSection<number> & {
            ItemSeparatorComponent: typeof separator;
          }
        >
          estimatedItemSize={50}
          keyExtractor={(_item, index) => `seven:${index}`}
          onReorder={jest.fn()}
          renderItem={({ item }) => <Text>{item}</Text>}
          sections={repeated}
        />
      </GestureHandlerRootView>
    );
    expect(
      rendered.getByTestId('reorderable-section-list-item-separator-seven:0')
    ).toBeOnTheScreen();
    expect(
      rendered.getByTestId('reorderable-section-list-item-separator-seven:1')
    ).toBeOnTheScreen();
    expect(separator).toHaveBeenCalledTimes(2);
    expect(separator.mock.calls.map(([props]) => props.leadingItem)).toEqual([
      7, 7,
    ]);
    await rendered.unmount();
  });

  it('retains a section-level renderer inside the owned reorder cell', async () => {
    const sectionRenderItem = jest.fn(({ item }: { item: Item }) => (
      <Text>{`Section ${item.label}`}</Text>
    ));
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableSectionList<Item, Section>
          keyExtractor={(item) => item.id}
          onReorder={jest.fn()}
          renderItem={({ item }) => <Text>{`List ${item.label}`}</Text>}
          sections={[
            {
              ...sections[1]!,
              key: 'caller-key-must-not-own-identity',
              renderItem: sectionRenderItem,
            } as Section,
          ]}
        />
      </GestureHandlerRootView>
    );
    expect(sectionRenderItem).toHaveBeenCalledTimes(2);
    expect(sectionRenderItem.mock.calls[0]?.[0].item).toBe(
      sections[1]!.data[0]
    );
    expect(
      rendered.getByTestId('reorderable-section-list-wrapper-a')
    ).toBeOnTheScreen();
    await rendered.unmount();
  });

  it('unwraps row and section viewability tokens for direct callbacks and callback pairs', () => {
    const section = {
      id: 'viewability',
      title: 'Viewability',
      value: 'legitimate application metadata',
      data: [{ id: 'visible', label: 'Visible' }],
    };
    const viewportItem = createSectionViewportItem(
      'visible',
      0,
      section.data[0]!
    );
    const viewportSection = { ...section, data: [viewportItem] };
    const rowToken = {
      index: 0,
      isViewable: true,
      item: viewportItem,
      key: 'visible',
      section: viewportSection,
    };
    const sectionToken = {
      index: 0,
      isViewable: true,
      item: viewportSection,
      key: 'viewability',
      section: viewportSection,
    };
    const directInfo = unwrapSectionViewability(
      {
        changed: [rowToken],
        viewableItems: [rowToken, sectionToken],
      },
      new Map([[section.id, section]])
    );
    expect(directInfo.changed[0]).toMatchObject({
      item: section.data[0],
      section,
    });
    expect(directInfo.viewableItems[1]).toMatchObject({
      item: section,
      section,
    });
  });

  it('keeps exact item anchors while unequal measured chrome refines hit testing', () => {
    const exactSections: readonly ReorderableListSection<string>[] = [
      { id: 'empty', data: [] },
      { id: 'filled', data: ['first'] },
    ];
    const model = createSectionModel<string, ReorderableListSection<string>>(
      exactSections,
      (item: string) => item,
      () => ({ offset: 90, length: 50 }),
      30
    );
    if (!model.geometry.exact) throw new Error('expected exact geometry');
    let geometry: ExactGeometry = model.geometry;
    if (!geometry.grouped) throw new Error('expected grouped exact geometry');
    const anchorOffsets = geometry.anchorOffsets;
    const anchorLengths = geometry.anchorLengths;
    const measuredSizes = geometry.measuredSizes;
    geometry = applyExactChromeMeasurement(geometry, 0, 10);
    geometry = applyExactChromeMeasurement(geometry, 1, 20);
    if (!geometry.grouped) throw new Error('expected grouped exact geometry');
    expect(geometry.anchorOffsets).toBe(anchorOffsets);
    expect(geometry.anchorLengths).toBe(anchorLengths);
    expect(geometry.measuredSizes).toBe(measuredSizes);
    expect(itemOffset(geometry, 3)).toBe(90);
    expect(indexAtOffset(geometry, 95).index).toBe(3);
  });

  it.each(['exact', 'estimated'] as const)(
    'models retained list, section, separator, and content-padding geometry in %s mode',
    (mode) => {
      const safeSections: readonly ReorderableListSection<string>[] = [
        { id: 'one', data: ['a', 'b'] },
      ];
      const model = createSectionModel<string, ReorderableListSection<string>>(
        safeSections,
        (item: string) => item,
        mode === 'exact'
          ? (_current, _sectionIndex, itemIndex) => ({
              length: 50,
              offset: itemIndex === 0 ? 38 : 92,
            })
          : undefined,
        10,
        true,
        true,
        {
          contentPaddingBottom: 5,
          contentPaddingTop: 5,
          hasItemSeparator: true,
          hasListFooter: true,
          hasListHeader: true,
          hasSectionSeparator: true,
        }
      );
      const lengths: Record<string, number> = {
        'list:header': 10,
        'section:one:header': 20,
        'section:one:section-separator:leading': 3,
        'section:one:item-separator:a': 4,
        'section:one:section-separator:trailing': 3,
        'section:one:footer': 20,
        'list:footer': 10,
      };
      model.frames.forEach((frame, index) => {
        const length = lengths[frame.identity];
        const measuredLength = frame.kind === 'item' ? 50 : length;
        if (measuredLength == null) return;
        if (model.geometry.exact)
          applyExactChromeMeasurement(model.geometry, index, measuredLength);
        else applyMeasurement(model.geometry, index, measuredLength);
      });
      const first = model.itemFrameById['identity:a']!;
      const second = model.itemFrameById['identity:b']!;
      expect(itemOffset(model.geometry, first)).toBe(38);
      expect(itemOffset(model.geometry, second)).toBe(92);
      expect(contentLength(model.geometry)).toBe(180);
      expect(model.viewportFrameIndices).toHaveLength(4);
    }
  );

  it('retains and composes safe public list chrome and separator props with exact offsets', async () => {
    const safeSections: readonly ReorderableListSection<string>[] = [
      { id: 'one', data: ['a', 'b'] },
    ];
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableSectionList<string, ReorderableListSection<string>>
          ItemSeparatorComponent={() => <Text>Item gap</Text>}
          ListFooterComponent={() => <Text>List footer</Text>}
          ListHeaderComponent={() => <Text>List header</Text>}
          SectionSeparatorComponent={() => <Text>Section gap</Text>}
          contentContainerStyle={{ paddingBottom: 5, paddingTop: 5 }}
          getItemLayout={(_current, _sectionIndex, itemIndex) => ({
            length: 50,
            offset: itemIndex === 0 ? 38 : 92,
          })}
          keyExtractor={(item) => item}
          onReorder={jest.fn()}
          renderItem={({ item }) => <Text>{item}</Text>}
          renderSectionFooter={() => <Text>Section footer</Text>}
          renderSectionHeader={() => <Text>Section header</Text>}
          sections={safeSections}
        />
      </GestureHandlerRootView>
    );
    expect(rendered.getByText('List header')).toBeOnTheScreen();
    expect(rendered.getByText('List footer')).toBeOnTheScreen();
    expect(rendered.getByText('Item gap')).toBeOnTheScreen();
    expect(rendered.getAllByText('Section gap')).toHaveLength(2);
    await rendered.unmount();
  });

  it('resolves registered style arrays and discards stale header/style measurements across generations', async () => {
    const registered = StyleSheet.create({
      content: { paddingBottom: 4, paddingTop: '10%', rowGap: 6 },
      header: { height: 12 },
      tallerHeader: { height: 24 },
    });
    const makeList = (
      itemOffsetValue: number,
      headerStyle: (typeof registered)['header'],
      rowGap: number
    ) => (
      <GestureHandlerRootView>
        <ReorderableSectionList<string, ReorderableListSection<string>>
          ListHeaderComponent={() => <Text>Styled header</Text>}
          ListHeaderComponentStyle={[{ marginVertical: 0 }, headerStyle]}
          contentContainerStyle={[registered.content, { rowGap }]}
          getItemLayout={() => ({ length: 50, offset: itemOffsetValue })}
          keyExtractor={(item) => item}
          onReorder={jest.fn()}
          renderItem={({ item }) => <Text>{item}</Text>}
          sections={[{ id: 'styled', data: ['row'] }]}
          testID="style-generation-list"
        />
      </GestureHandlerRootView>
    );
    const rendered = await render(makeList(44, registered.header, 6));
    await fireEvent(rendered.getByTestId('style-generation-list'), 'layout', {
      nativeEvent: { layout: { height: 200, width: 200, x: 0, y: 0 } },
    });
    await fireEvent(
      rendered.getByTestId('reorderable-section-list-list-header'),
      'layout',
      { nativeEvent: { layout: { height: 12, width: 200, x: 0, y: 20 } } }
    );
    const staleOnLayout = rendered.getByTestId(
      'reorderable-section-list-list-header'
    ).props.onLayout as (event: {
      nativeEvent: { layout: { height: number } };
    }) => void;
    await rendered.rerender(makeList(60, registered.tallerHeader, 8));
    await act(async () => {
      staleOnLayout({ nativeEvent: { layout: { height: 999 } } });
    });
    await fireEvent(
      rendered.getByTestId('reorderable-section-list-list-header'),
      'layout',
      { nativeEvent: { layout: { height: 24, width: 200, x: 0, y: 20 } } }
    );
    expect(rendered.getByText('Styled header')).toBeOnTheScreen();
    await rendered.unmount();
  });

  it('assigns logical pointer bands to zero-width beginning, middle, end, consecutive, and all-empty sections', () => {
    const logicalSections: readonly ReorderableListSection<string>[] = [
      { id: 'start', data: [] },
      { id: 'one', data: ['a'] },
      { id: 'middle-a', data: [] },
      { id: 'middle-b', data: [] },
      { id: 'two', data: ['b'] },
      { id: 'end', data: [] },
    ];
    const model = createSectionModel<string, ReorderableListSection<string>>(
      logicalSections,
      (item) => item,
      undefined,
      50,
      false,
      false
    );
    const destination = (current: typeof model, offset: number) =>
      emptySectionDestinationAtOffset(
        current.geometry,
        current.emptyRuns,
        current.emptyRunByFrameIndex,
        current.sectionIds,
        indexAtOffset(current.geometry, offset, true).index,
        offset,
        300
      );
    expect(destination(model, 5)?.sectionId).toBe('start');
    const middleA = destination(model, 40);
    expect(middleA?.sectionId).toBe('middle-a');
    const middleB = destination(model, 60);
    expect(middleB?.sectionId).toBe('middle-b');
    expect(middleA?.feedbackOffset).not.toBe(middleB?.feedbackOffset);
    expect(destination(model, 72)).toMatchObject({
      sectionId: 'two',
      beforeId: 'b',
    });
    expect(destination(model, 250)?.sectionId).toBe('end');
    const allEmpty = createSectionModel(
      [
        { id: 'zero', data: [] },
        { id: 'one', data: [] },
        { id: 'two', data: [] },
      ],
      (item: string) => item,
      undefined,
      50,
      false,
      false
    );
    expect(destination(allEmpty, 150)?.sectionId).toBe('one');
  });

  it('models Yoga-resolved vertical padding and gaps as stable geometry frames', () => {
    const model = createSectionModel(
      [{ id: 'repeated', data: [7, 7] }],
      (_item, index) => `seven:${index}`,
      (_sections, _sectionIndex, itemIndex) => ({
        length: 50,
        offset: itemIndex === 0 ? 40 : 100,
      }),
      undefined,
      false,
      false,
      { contentGap: 10, contentPaddingBottom: 20, contentPaddingTop: 30 }
    );
    expect(
      itemOffset(model.geometry, model.itemFrameById['identity:seven:0']!)
    ).toBe(40);
    expect(
      itemOffset(model.geometry, model.itemFrameById['identity:seven:1']!)
    ).toBe(100);
    expect(
      model.frames.filter((frame) => frame.kind === 'contentGap')
    ).toHaveLength(3);
    expect(contentLength(model.geometry)).toBe(180);
  });

  it.each(['estimated', 'exact'] as const)(
    'places one content gap per native cell boundary with internal separators in %s mode',
    (mode) => {
      const model = createSectionModel(
        [{ id: 'separated', data: ['a', 'b'] }],
        (item: string) => item,
        mode === 'exact'
          ? (_sections, _sectionIndex, itemIndex) => ({
              length: 50,
              offset: itemIndex === 0 ? 10 : 70,
            })
          : undefined,
        50,
        false,
        false,
        { contentGap: 10, hasItemSeparator: true, hasSectionSeparator: true }
      );
      expect(model.frames.map((frame) => frame.kind)).toEqual([
        'header',
        'contentGap',
        'sectionSeparator',
        'item',
        'itemSeparator',
        'contentGap',
        'item',
        'sectionSeparator',
        'contentGap',
        'footer',
      ]);
      expect(
        model.frames.filter((frame) => frame.kind === 'contentGap')
      ).toHaveLength(3);
      expect(Array.from(model.viewportFrameIndices)).toEqual([0, 2, 6, 9]);
      expect(itemOffset(model.geometry, model.viewportFrameIndices[1]!)).toBe(
        10
      );
      expect(itemOffset(model.geometry, model.viewportFrameIndices[2]!)).toBe(
        mode === 'exact' ? 70 : 170
      );
    }
  );

  it('bounds exact chrome correction and gap lookup logarithmically across a worst-case empty run', () => {
    const chromeCount = 16_384;
    const exactItems: ({ offset: number; length: number } | null)[] = new Array(
      chromeCount + 2
    ).fill(null);
    exactItems[0] = { offset: 0, length: 40 };
    exactItems[chromeCount + 1] = {
      offset: 40 + chromeCount * 8,
      length: 50,
    };
    const geometry = createGroupedExactGeometry(exactItems, 8);
    const references = {
      anchorLengths: geometry.anchorLengths,
      anchorOffsets: geometry.anchorOffsets,
      measuredFlags: geometry.measuredFlags,
      measuredSizes: geometry.measuredSizes,
      treeMeasuredCounts: geometry.treeMeasuredCounts,
      treeMeasuredSums: geometry.treeMeasuredSums,
    };
    const bytes = geometryByteLength(geometry);
    const correction = applyGroupedExactMeasurement(
      geometry,
      Math.floor(chromeCount / 2),
      12
    );
    expect(correction.changed).toBe(true);
    expect(correction.updateSteps).toBeLessThanOrEqual(
      2 * Math.ceil(Math.log2(geometry.treeBase)) + 2
    );
    expect(geometryByteLength(geometry)).toBe(bytes);
    expect(geometry.anchorLengths).toBe(references.anchorLengths);
    expect(geometry.anchorOffsets).toBe(references.anchorOffsets);
    expect(geometry.measuredFlags).toBe(references.measuredFlags);
    expect(geometry.measuredSizes).toBe(references.measuredSizes);
    expect(geometry.treeMeasuredCounts).toBe(references.treeMeasuredCounts);
    expect(geometry.treeMeasuredSums).toBe(references.treeMeasuredSums);
    expect(itemOffset(geometry, 0)).toBe(0);
    expect(itemLength(geometry, 0)).toBe(40);
    expect(itemOffset(geometry, chromeCount + 1)).toBe(40 + chromeCount * 8);
    expect(itemLength(geometry, chromeCount + 1)).toBe(50);
    expect(contentLength(geometry)).toBe(40 + chromeCount * 8 + 50);
    const lookup = indexAtOffset(geometry, 40 + chromeCount * 4);
    expect(lookup.index).toBeGreaterThan(0);
    expect(lookup.index).toBeLessThan(chromeCount + 1);
    expect(lookup.steps).toBeLessThanOrEqual(
      2 * Math.ceil(Math.log2(geometry.treeBase)) + 1
    );
  });

  it('rejects exact chrome measurements that contradict immutable item anchors without mutation', () => {
    const geometry = createGroupedExactGeometry(
      [{ offset: 0, length: 20 }, null, null, { offset: 60, length: 20 }],
      20
    );
    const sums = geometry.treeMeasuredSums.slice();
    const counts = geometry.treeMeasuredCounts.slice();
    expect(() => applyGroupedExactMeasurement(geometry, 1, 41)).toThrow(
      'contradicts exact item anchors'
    );
    expect(geometry.measuredFlags[1]).toBe(0);
    expect(geometry.treeMeasuredSums).toEqual(sums);
    expect(geometry.treeMeasuredCounts).toEqual(counts);
  });

  it('uses measured zero chrome with exact offset-zero anchors', () => {
    const model = createSectionModel<string, ReorderableListSection<string>>(
      [{ id: 'filled', data: ['first'] }],
      (item) => item,
      () => ({ offset: 0, length: 50 }),
      50,
      false,
      false
    );
    expect(itemOffset(model.geometry, 1)).toBe(0);
    expect(itemOffset(model.geometry, model.frames.length)).toBe(50);
    expect(indexAtOffset(model.geometry, 0).index).toBe(1);
  });

  it('preserves early chrome measurements and remaps pending identities across order changes', () => {
    const original = createSectionModel<Item, Section>(
      sections,
      (item) => item.id,
      undefined,
      64
    );
    const reordered = createSectionModel<Item, Section>(
      [sections[1]!, sections[0]!, ...sections.slice(2)],
      (item) => item.id,
      undefined,
      64
    );
    const headerIdentity = original.frames[2]!.identity;
    const queue = {
      cursor: 1,
      generations: [1, 2, 3],
      identities: ['already-consumed', headerIdentity, 'removed'],
      indices: [0, 2, 999],
      lengths: [1, 32, 99],
    };
    expect(remapSectionMeasurementQueue(queue, original.frames)).toEqual({
      cursor: 0,
      generations: [2],
      identities: [headerIdentity],
      indices: [2],
      lengths: [32],
    });
    expect(remapSectionMeasurementQueue(queue, reordered.frames)).toEqual({
      cursor: 0,
      generations: [2],
      identities: [headerIdentity],
      indices: [0],
      lengths: [32],
    });
  });

  it('retains consumed exact chrome measurements by stable identity across section reordering', () => {
    const compact: readonly ReorderableListSection<string>[] = [
      { id: 'one', data: ['a'] },
      { id: 'two', data: ['b'] },
    ];
    const layout = (
      current: readonly ReorderableListSection<string>[],
      sectionIndex: number
    ) => {
      let offset = 10;
      for (let index = 0; index < sectionIndex; index += 1)
        offset += current[index]!.data.length * 50 + 30;
      return { offset, length: 50 };
    };
    const original = createSectionModel<string, ReorderableListSection<string>>(
      compact,
      (item) => item,
      layout,
      20
    );
    if (!original.geometry.exact)
      throw new Error('expected exact original geometry');
    const oldIndex = original.frames.findIndex(
      (frame) => frame.identity === 'section:one:footer'
    );
    applyExactChromeMeasurement(original.geometry, oldIndex, 20);
    const replacement = createSectionModel<
      string,
      ReorderableListSection<string>
    >([compact[1]!, compact[0]!], (item) => item, layout, 20);
    if (!replacement.geometry.exact)
      throw new Error('expected exact replacement geometry');
    const nextIndex = replacement.frames.findIndex(
      (frame) => frame.identity === original.frames[oldIndex]!.identity
    );
    applyExactChromeMeasurement(
      replacement.geometry,
      nextIndex,
      itemLength(original.geometry, oldIndex)
    );
    expect(replacement.geometry.measuredFlags[nextIndex]).toBe(1);
    expect(itemLength(replacement.geometry, nextIndex)).toBe(20);
  });

  it('uses zero-length geometry when global section chrome renderers are absent', () => {
    const noChromeSections: readonly ReorderableListSection<string>[] = [
      { id: 'empty-start', data: [] },
      { id: 'filled', data: ['first'] },
      { id: 'empty-end', data: [] },
    ];
    const model = createSectionModel<string, ReorderableListSection<string>>(
      noChromeSections,
      (item) => item,
      undefined,
      50,
      false,
      false
    );
    expect(itemOffset(model.geometry, 3)).toBe(0);
    expect(itemOffset(model.geometry, model.frames.length)).toBe(50);
    expect(indexAtOffset(model.geometry, 0).index).toBe(3);
  });

  it('selects the explicit conforming SectionList engine policy', () => {
    expect(resolveSectionListEngine('auto', 'ios', true)).toBe('fallback');
    expect(resolveSectionListEngine('fallback', 'android', true)).toBe(
      'fallback'
    );
    expect(resolveSectionListEngine('auto', 'web', false)).toBe('disabled');
  });

  it('composes application accessibility semantics and handlers on the focusable target', async () => {
    const onAccessibilityAction = jest.fn();
    const onAccessibilityTap = jest.fn();
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableSectionList<Item, Section>
          sections={sections}
          keyExtractor={(item) => item.id}
          selectedIds={['a']}
          onReorder={jest.fn()}
          renderItem={({ item }) => (
            <View
              accessible
              accessibilityActions={[{ name: 'activate', label: 'Open' }]}
              accessibilityHint="Application hint"
              accessibilityLabel={`Application ${item.label}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              onAccessibilityAction={onAccessibilityAction}
              onAccessibilityTap={onAccessibilityTap}
            >
              <Text>{item.label}</Text>
            </View>
          )}
        />
      </GestureHandlerRootView>
    );
    const target = rendered.getByTestId('reorderable-section-list-wrapper-a');
    expect(target).toHaveProp('accessibilityLabel', 'Application A');
    expect(target).toHaveProp('accessibilityHint', 'Application hint');
    expect(target).toHaveProp('accessibilityRole', 'button');
    expect(target).toHaveProp('accessibilityState', {
      disabled: true,
      selected: true,
    });
    expect(target).toHaveProp('onAccessibilityTap', onAccessibilityTap);
    await fireEvent(target, 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(onAccessibilityAction).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it('scrolls the controlled section location into exposure before restoring accessible focus', async () => {
    const ref = createRef<SectionList<Item, Section>>();
    const onReorder = jest.fn();
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableSectionList<Item, Section>
          accessibilityStrings={{ moveLaterAction: 'Move down' }}
          ref={ref}
          sections={sections}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
        />
      </GestureHandlerRootView>
    );
    const scrollToLocation = jest.fn();
    if (ref.current == null) throw new Error('expected SectionList ref');
    ref.current.scrollToLocation = scrollToLocation;
    await fireEvent(
      rendered.getByTestId('reorderable-section-list-wrapper-b'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'reorder-move-later' } }
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(scrollToLocation).toHaveBeenCalledWith({
      animated: false,
      itemIndex: 1,
      sectionIndex: 1,
      viewPosition: 0.5,
    });
    await rendered.unmount();
  });

  it('settles a synchronous controlled accessibility rejection exactly once without a rerender', async () => {
    const ref = createRef<SectionList<Item, Section>>();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableSectionList<Item, Section>
          ref={ref}
          sections={sections}
          keyExtractor={(item) => item.id}
          onReorder={jest.fn()}
          renderItem={({ item }) => <Text>{item.label}</Text>}
        />
      </GestureHandlerRootView>
    );
    if (ref.current == null) throw new Error('expected SectionList ref');
    ref.current.scrollToLocation = jest.fn();
    await fireEvent(
      rendered.getByTestId('reorderable-section-list-wrapper-b'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'reorder-move-later' } }
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(
      announce.mock.calls.filter(([message]) =>
        String(message).includes('Order updated')
      )
    ).toHaveLength(1);
    announce.mockRestore();
    await rendered.unmount();
  });

  it('commits a canonical cross-section selection by identities only', async () => {
    const onReorder = jest.fn();
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableSectionList<Item, Section>
          sections={sections}
          estimatedItemSize={50}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={({
            item,
          }: ReorderableSectionListRenderItemInfo<Item, Section>) => (
            <Text>{item.label}</Text>
          )}
          renderSectionHeader={({ section }) => (
            <View style={{ height: 20 }}>
              <Text>{section.title}</Text>
            </View>
          )}
          selectedIds={['c', 'a', 'missing', 'c']}
          testID="selection-sections"
        />
      </GestureHandlerRootView>
    );
    await fireEvent(rendered.getByTestId('selection-sections'), 'layout', {
      nativeEvent: { layout: { height: 400, width: 300, x: 0, y: 0 } },
    });
    await act(async () => {
      fireGestureHandler(
        getByGestureTestId('reorderable-section-list-viewport'),
        [
          { state: State.BEGAN, y: 125 },
          { state: State.ACTIVE, y: 125 },
          { state: State.END, y: 225 },
        ]
      );
    });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0]?.[0]).toMatchObject({
      sourceIds: ['a', 'c'],
      destination: { sectionId: 'empty-middle', beforeId: null },
    });
    await rendered.unmount();
  });

  it('commits one same-section pointer move with absent chrome', async () => {
    const onReorder = jest.fn();
    const oneSection: readonly Section[] = [sections[1]!];
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableSectionList<Item, Section>
          sections={oneSection}
          estimatedItemSize={50}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          testID="same-section-list"
        />
      </GestureHandlerRootView>
    );
    await fireEvent(rendered.getByTestId('same-section-list'), 'layout', {
      nativeEvent: { layout: { height: 200, width: 300, x: 0, y: 0 } },
    });
    await act(async () => {
      fireGestureHandler(
        getByGestureTestId('reorderable-section-list-viewport'),
        [
          { state: State.BEGAN, y: 25 },
          { state: State.ACTIVE, y: 25 },
          { state: State.END, y: 125 },
        ]
      );
    });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0]?.[0]).toMatchObject({
      sourceIds: ['a'],
      destination: { sectionId: 'one', beforeId: null },
    });
    await rendered.unmount();
  });

  it('keeps one uninterrupted production gesture active at the stationary edge without JS render churn', async () => {
    const onReorder = jest.fn();
    const renderItem = jest.fn(({ item }: { item: string }) => (
      <Text>{item}</Text>
    ));
    const longSection: readonly ReorderableListSection<string>[] = [
      {
        id: 'long',
        data: Array.from({ length: 120 }, (_value, index) => `row-${index}`),
      },
    ];
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableSectionList<string, ReorderableListSection<string>>
          estimatedItemSize={50}
          keyExtractor={(item) => item}
          onReorder={onReorder}
          renderItem={renderItem}
          sections={longSection}
          testID="long-section-list"
        />
      </GestureHandlerRootView>
    );
    await fireEvent(rendered.getByTestId('long-section-list'), 'layout', {
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
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0]?.[0]).toMatchObject({
      sourceIds: ['row-0'],
      destination: { sectionId: 'long' },
    });
    expect(renderItem).toHaveBeenCalledTimes(rendersBeforeGesture);
    await rendered.unmount();
  });

  it('uses the production auto-scroll plan and destination resolver across several stationary-edge viewports', () => {
    const longSection = [
      {
        id: 'long',
        data: Array.from({ length: 120 }, (_value, index) => `row-${index}`),
      },
    ];
    const model = createSectionModel(
      longSection,
      (item: string) => item,
      undefined,
      50,
      false,
      false
    );
    const viewport = 200;
    let offset = 0;
    const feedbackPositions = new Set<number>();
    let destination = { sectionId: 'long', beforeId: 'row-0' as string | null };
    for (let tick = 0; tick < 50; tick += 1) {
      const plan = planSectionAutoScroll(
        195,
        viewport,
        offset,
        contentLength(model.geometry)
      );
      expect(plan.active).toBe(true);
      expect(sectionAutoScrollDuration(plan, offset)).toBeGreaterThan(0);
      offset = stepSectionAutoScroll(plan, offset, 100);
      const frameIndex = indexAtOffset(
        model.geometry,
        offset + 195,
        true
      ).index;
      destination = destinationAtSectionFrame(
        model.frames,
        model.sectionIds,
        model.order.map((entry) => entry.itemIds),
        frameIndex
      )!;
      feedbackPositions.add(
        Math.max(
          0,
          Math.min(viewport, itemOffset(model.geometry, frameIndex) - offset)
        )
      );
    }
    expect(offset).toBeGreaterThan(viewport * 5);
    expect(feedbackPositions.size).toBeGreaterThan(2);
    expect(destination.beforeId).not.toBe('row-0');
    const onTerminal = jest.fn();
    const event = reconcileReorder(model.order, ['row-0'], destination);
    if (event != null) onTerminal(event);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    const cancelled = planSectionAutoScroll(
      100,
      viewport,
      offset,
      contentLength(model.geometry)
    );
    expect(cancelled.active).toBe(false);
    expect(stepSectionAutoScroll(cancelled, offset, 1000)).toBe(offset);
  });

  it('cancels an active pointer interaction when disabled', async () => {
    const onReorder = jest.fn();
    const renderList = (enabled: boolean) => (
      <GestureHandlerRootView>
        <ReorderableSectionList<Item, Section>
          enabled={enabled}
          sections={[sections[1]!]}
          estimatedItemSize={50}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          testID="cancel-section-list"
        />
      </GestureHandlerRootView>
    );
    const rendered = await render(renderList(true));
    await fireEvent(rendered.getByTestId('cancel-section-list'), 'layout', {
      nativeEvent: { layout: { height: 200, width: 300, x: 0, y: 0 } },
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
    await rendered.rerender(renderList(false));
    await act(async () => {
      fireGestureHandler(
        getByGestureTestId('reorderable-section-list-viewport'),
        [{ state: State.END, y: 75 }]
      );
    });
    expect(onReorder).not.toHaveBeenCalled();
    expect(
      rendered.getByTestId('reorderable-section-list-destination-feedback')
    ).toHaveStyle({ opacity: 0 });
    await rendered.unmount();
  });

  it('cancels when the active source identity disappears during reconciliation', async () => {
    const onReorder = jest.fn();
    const renderList = (data: readonly Item[]) => (
      <GestureHandlerRootView>
        <ReorderableSectionList<Item, Section>
          sections={[{ id: 'one', title: 'One', data }]}
          estimatedItemSize={50}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          testID="stale-source-list"
        />
      </GestureHandlerRootView>
    );
    const rendered = await render(renderList(sections[1]!.data));
    await fireEvent(rendered.getByTestId('stale-source-list'), 'layout', {
      nativeEvent: { layout: { height: 200, width: 300, x: 0, y: 0 } },
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
    await rendered.rerender(renderList([sections[1]!.data[1]!]));
    await act(async () => {
      fireGestureHandler(
        getByGestureTestId('reorderable-section-list-viewport'),
        [{ state: State.END, y: 75 }]
      );
    });
    expect(onReorder).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  it.each<[string, number]>([
    ['empty-start', 25],
    ['empty-middle', 325],
    ['empty-end', 625],
  ])(
    'commits into the %s section without a consumer placeholder item',
    async (sectionId, destinationY) => {
      const onReorder = jest.fn();
      const rendered = await render(
        <GestureHandlerRootView>
          <ReorderableSectionList<Item, Section>
            sections={sections}
            estimatedItemSize={50}
            keyExtractor={(item) => item.id}
            onReorder={onReorder}
            renderItem={({ item }) => <Text>{item.label}</Text>}
            renderSectionHeader={({ section }) => <Text>{section.title}</Text>}
            renderSectionFooter={({ section }) => <Text>{section.id}</Text>}
            testID="empty-destination-list"
          />
        </GestureHandlerRootView>
      );
      await fireEvent(
        rendered.getByTestId('empty-destination-list'),
        'layout',
        {
          nativeEvent: { layout: { height: 700, width: 300, x: 0, y: 0 } },
        }
      );
      await act(async () => {
        fireGestureHandler(
          getByGestureTestId('reorderable-section-list-viewport'),
          [
            { state: State.BEGAN, y: 175 },
            { state: State.ACTIVE, y: 175 },
            { state: State.END, y: destinationY },
          ]
        );
      });
      expect(onReorder).toHaveBeenCalledTimes(1);
      expect(onReorder.mock.calls[0]?.[0]).toMatchObject({
        sourceIds: ['a'],
        destination: { sectionId, beforeId: null },
      });
      await rendered.unmount();
    }
  );

  it('fails descriptively for duplicate section/item identities and malformed exact geometry', async () => {
    const base = {
      keyExtractor: (item: Item) => item.id,
      onReorder: jest.fn(),
      renderItem: ({
        item,
      }: ReorderableSectionListRenderItemInfo<Item, Section>) => (
        <Text>{item.label}</Text>
      ),
    };
    await expect(
      render(
        <ReorderableSectionList<Item, Section>
          {...base}
          sections={[sections[0]!, sections[0]!]}
        />
      )
    ).rejects.toThrow('Duplicate ReorderableSectionList section id');
    await expect(
      render(
        <ReorderableSectionList<Item, Section>
          {...base}
          sections={[
            { id: 'x', title: 'X', data: [{ id: 'same', label: 'S' }] },
            { id: 'y', title: 'Y', data: [{ id: 'same', label: 'S' }] },
          ]}
        />
      )
    ).rejects.toThrow('Duplicate ReorderableSectionList item id');
    await expect(
      render(
        <ReorderableSectionList<Item, Section>
          {...base}
          sections={sections}
          getItemLayout={() => ({ length: 50, offset: 0 })}
        />
      )
    ).rejects.toThrow('absolute');
  });

  it('accepts an offset-zero first item when preceding chrome has zero height', async () => {
    const oneSection: readonly Section[] = [
      {
        id: 'plain',
        title: 'Plain',
        data: [{ id: 'first', label: 'First' }],
      },
    ];
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableSectionList<Item, Section>
          sections={oneSection}
          getItemLayout={() => ({ length: 50, offset: 0 })}
          keyExtractor={(item) => item.id}
          onReorder={jest.fn()}
          renderItem={({ item }) => <Text>{item.label}</Text>}
        />
      </GestureHandlerRootView>
    );
    expect(rendered.getByText('First')).toBeOnTheScreen();
    await rendered.unmount();
  });

  it('never leaves an enabled unsupported-platform section list inert', () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    try {
      expect(() =>
        ReorderableSectionList<Item, Section>({
          sections,
          keyExtractor: (item: Item) => item.id,
          onReorder: jest.fn(),
          renderItem: ({
            item,
          }: ReorderableSectionListRenderItemInfo<Item, Section>) => (
            <Text>{item.label}</Text>
          ),
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
