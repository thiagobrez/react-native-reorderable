import type { SectionModel } from './section-list-model';
import type { SectionListViewportBridge } from './reorderable-section-list';
import type { ReorderableListSection } from './types';

export type FlashSectionEntry<Item, Section> = Readonly<{
  frameIndex: number;
  identity: string;
  item: Item | null;
  itemIndex: number;
  kind: 'footer' | 'header' | 'item' | 'itemSeparator' | 'sectionSeparator';
  section: Section;
}>;

type ViewabilityToken = Readonly<{
  index: number | undefined;
  isViewable: boolean;
  item: unknown;
  key: string;
  section?: unknown;
}>;

type ProviderViewabilityInfo = Readonly<{
  changed: readonly ViewabilityToken[];
  viewableItems: readonly ViewabilityToken[];
}>;
type ApplicationViewabilityInfo = {
  changed: ViewabilityToken[];
  viewableItems: ViewabilityToken[];
};

export function createFlashSectionEntries<
  Item,
  Section extends ReorderableListSection<Item>,
>(
  model: SectionModel<Item, Section>
): readonly FlashSectionEntry<Item, Section>[] {
  return model.frames.flatMap((frame, frameIndex) => {
    if (
      frame.sectionIndex < 0 ||
      frame.kind === 'contentGap' ||
      frame.kind === 'contentPadding' ||
      frame.kind === 'listEmpty' ||
      frame.kind === 'listFooter' ||
      frame.kind === 'listHeader'
    )
      return [];
    const section = model.sections[frame.sectionIndex];
    if (section == null) return [];
    const itemIndex =
      frame.itemId == null
        ? -1
        : model.order[frame.sectionIndex]!.itemIds.indexOf(frame.itemId);
    return [
      {
        frameIndex,
        identity: frame.identity,
        item: itemIndex < 0 ? null : section.data[itemIndex]!,
        itemIndex,
        kind: frame.kind as FlashSectionEntry<Item, Section>['kind'],
        section,
      },
    ];
  });
}

export function flashSectionItemProviderIndex<Item, Section>(
  entries: readonly FlashSectionEntry<Item, Section>[],
  sectionId: string,
  itemIndex: number
): number {
  return entries.findIndex(
    (entry) =>
      entry.kind === 'item' &&
      (entry.section as { id?: string }).id === sectionId &&
      entry.itemIndex === itemIndex
  );
}

export function renderFlashSectionEntry<Item, Section>(
  entry: FlashSectionEntry<Item, Section>,
  renderers: Parameters<SectionListViewportBridge['renderEntry']>[1]
) {
  if (entry.kind === 'item')
    return renderers.renderItem({
      item: entry.item,
      itemIndex: entry.itemIndex,
      section: entry.section,
    });
  if (entry.kind === 'header' || entry.kind === 'footer')
    return renderers.renderChrome({
      kind: entry.kind,
      section: entry.section,
    });
  if (entry.kind === 'itemSeparator')
    return renderers.renderItemSeparator({
      frameIndex: entry.frameIndex,
      identity: entry.identity,
      section: entry.section,
    });
  return renderers.renderSectionSeparator({
    edge: entry.identity.endsWith(':leading') ? 'leading' : 'trailing',
    frameIndex: entry.frameIndex,
    identity: entry.identity,
    section: entry.section,
  });
}

export function createFlashSectionRef<Item, Section>(
  provider: Record<string, (...args: never[]) => unknown>,
  entries: readonly FlashSectionEntry<Item, Section>[]
): Record<string, unknown> {
  const itemEntries = entries
    .map((entry, providerIndex) => ({ entry, providerIndex }))
    .filter(({ entry }) => entry.kind === 'item');
  const call = (name: string, ...args: unknown[]) =>
    provider[name]?.(...(args as never[]));
  const logicalIndex = (providerIndex: number) =>
    itemEntries.findIndex((entry) => entry.providerIndex >= providerIndex);
  return {
    clearLayoutCacheOnUpdate: () => call('clearLayoutCacheOnUpdate'),
    computeVisibleIndices: () => {
      const visible = call('computeVisibleIndices') as
        { endIndex: number; startIndex: number } | undefined;
      if (visible == null) return { endIndex: -1, startIndex: -1 };
      const visibleItems = itemEntries.filter(
        ({ providerIndex }) =>
          providerIndex >= visible.startIndex &&
          providerIndex <= visible.endIndex
      );
      return {
        endIndex:
          visibleItems.length === 0
            ? -1
            : itemEntries.indexOf(visibleItems[visibleItems.length - 1]!),
        startIndex:
          visibleItems.length === 0
            ? -1
            : itemEntries.indexOf(visibleItems[0]!),
      };
    },
    flashScrollIndicators: () => call('flashScrollIndicators'),
    getAbsoluteLastScrollOffset: () => call('getAbsoluteLastScrollOffset'),
    getChildContainerDimensions: () => call('getChildContainerDimensions'),
    getFirstItemOffset: () => call('getFirstItemOffset'),
    getFirstVisibleIndex: () => {
      const providerIndex = call('getFirstVisibleIndex') as number | undefined;
      return providerIndex == null ? -1 : logicalIndex(providerIndex);
    },
    getLayout: (index: number) =>
      call('getLayout', itemEntries[index]?.providerIndex ?? -1),
    getNativeScrollRef: () => call('getNativeScrollRef'),
    getScrollableNode: () => call('getScrollableNode'),
    getScrollResponder: () => call('getScrollResponder'),
    getWindowSize: () => call('getWindowSize'),
    prepareForLayoutAnimationRender: () =>
      call('prepareForLayoutAnimationRender'),
    recomputeViewableItems: () => call('recomputeViewableItems'),
    recordInteraction: () => call('recordInteraction'),
    scrollToEnd: (params?: unknown) => call('scrollToEnd', params),
    scrollToIndex: (params: { index: number }) =>
      call('scrollToIndex', {
        ...params,
        index: itemEntries[params.index]?.providerIndex ?? -1,
      }),
    scrollToItem: (params: { item: Item }) => {
      const target = itemEntries.find(({ entry }) =>
        Object.is(entry.item, params.item)
      );
      return call('scrollToIndex', {
        ...params,
        index: target?.providerIndex ?? -1,
        item: undefined,
      });
    },
    scrollToOffset: (params: unknown) => call('scrollToOffset', params),
    scrollToTop: (params?: unknown) => call('scrollToTop', params),
  };
}

export function unwrapFlashSectionViewability<Item, Section>(
  info: ProviderViewabilityInfo,
  keyExtractor: (item: Item, index: number, section: Section) => string
): ApplicationViewabilityInfo {
  const unwrap = (token: ViewabilityToken): ViewabilityToken | null => {
    const entry = token.item as FlashSectionEntry<Item, Section> | undefined;
    if (entry?.section == null || entry.kind !== 'item') return null;
    return {
      ...token,
      index: entry.itemIndex,
      item: entry.item,
      key: keyExtractor(entry.item!, entry.itemIndex, entry.section),
      section: entry.section,
    };
  };
  return {
    changed: info.changed.flatMap((token) => {
      const value = unwrap(token);
      return value == null ? [] : [value];
    }),
    viewableItems: info.viewableItems.flatMap((token) => {
      const value = unwrap(token);
      return value == null ? [] : [value];
    }),
  };
}

type ProviderPropOptions<Item, Section> = Readonly<{
  entries: readonly FlashSectionEntry<Item, Section>[];
  listEmpty: unknown;
  listFooter: unknown;
  listHeader: unknown;
  onLayout: unknown;
  onScroll: unknown;
  onViewableItemsChanged: unknown;
  providerProps: Record<string, unknown>;
  ref: unknown;
  renderItem: unknown;
  renderScrollComponent: unknown;
  scrollEventThrottle: number | undefined;
  viewabilityConfigCallbackPairs: unknown;
}>;

export function createFlashSectionProviderProps<Item, Section>({
  entries,
  listEmpty,
  listFooter,
  listHeader,
  onLayout,
  onScroll,
  onViewableItemsChanged,
  providerProps: originalProviderProps,
  ref,
  renderItem,
  renderScrollComponent,
  scrollEventThrottle,
  viewabilityConfigCallbackPairs,
}: ProviderPropOptions<Item, Section>): Record<string, unknown> {
  const providerProps = { ...originalProviderProps };
  const appGetItemType = providerProps.getItemType as
    ((item: Item, index: number, extraData?: unknown) => unknown) | undefined;
  const appOverrideItemLayout = providerProps.overrideItemLayout as
    | ((
        layout: Record<string, unknown>,
        item: Item,
        index: number,
        maxColumns: number,
        extraData?: unknown
      ) => void)
    | undefined;
  const applicationInitialIndex = providerProps.initialScrollIndex as
    number | undefined;
  const applicationStickyIndices = providerProps.stickyHeaderIndices as
    readonly number[] | undefined;
  const applicationOnChangeStickyIndex = providerProps.onChangeStickyIndex as
    ((current: number, previous: number) => void) | undefined;
  const providerItemEntries = entries
    .map((entry, providerIndex) => ({ entry, providerIndex }))
    .filter(({ entry }) => entry.kind === 'item');
  delete providerProps.getItemType;
  delete providerProps.initialScrollIndex;
  delete providerProps.onChangeStickyIndex;
  delete providerProps.overrideItemLayout;
  delete providerProps.stickyHeaderIndices;
  return {
    ...providerProps,
    data: entries,
    getItemType: (
      entry: FlashSectionEntry<Item, Section>,
      _providerIndex: number,
      extraData?: unknown
    ) =>
      entry.kind === 'item'
        ? appGetItemType?.(entry.item!, entry.itemIndex, extraData)
        : `reorderable-section-${entry.kind}`,
    initialScrollIndex:
      applicationInitialIndex == null
        ? undefined
        : providerItemEntries[applicationInitialIndex]?.providerIndex,
    keyExtractor: (entry: FlashSectionEntry<Item, Section>) => entry.identity,
    ListEmptyComponent: listEmpty,
    ListFooterComponent: listFooter,
    ListHeaderComponent: listHeader,
    maintainVisibleContentPosition: { disabled: true },
    onChangeStickyIndex:
      applicationOnChangeStickyIndex == null
        ? undefined
        : (current: number, previous: number) =>
            applicationOnChangeStickyIndex(
              providerItemEntries.findIndex(
                (entry) => entry.providerIndex === current
              ),
              providerItemEntries.findIndex(
                (entry) => entry.providerIndex === previous
              )
            ),
    onLayout,
    onScroll,
    onViewableItemsChanged,
    overrideItemLayout:
      appOverrideItemLayout == null
        ? undefined
        : (
            layout: Record<string, unknown>,
            entry: FlashSectionEntry<Item, Section>,
            _index: number,
            maxColumns: number,
            extraData?: unknown
          ) => {
            if (entry.kind === 'item')
              appOverrideItemLayout(
                layout,
                entry.item!,
                entry.itemIndex,
                maxColumns,
                extraData
              );
          },
    ref,
    renderItem,
    renderScrollComponent,
    scrollEventThrottle,
    stickyHeaderIndices: applicationStickyIndices?.flatMap((index) => {
      const providerIndex = providerItemEntries[index]?.providerIndex;
      return providerIndex == null ? [] : [providerIndex];
    }),
    viewabilityConfigCallbackPairs,
  };
}

export const flashSectionViewportBridge: SectionListViewportBridge = {
  createEntries: (model) => createFlashSectionEntries(model as never),
  createProviderProps: (options) =>
    createFlashSectionProviderProps(options as never),
  createRef: (provider, entries) =>
    createFlashSectionRef(provider, entries as never),
  itemProviderIndex: (entries, sectionId, itemIndex) =>
    flashSectionItemProviderIndex(entries as never, sectionId, itemIndex),
  renderEntry: (entry, renderers) =>
    renderFlashSectionEntry(entry as never, renderers),
  unwrapViewability: (info, keyExtractor) =>
    unwrapFlashSectionViewability(info, keyExtractor as never),
};
