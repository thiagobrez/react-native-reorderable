import {
  createElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefAttributes,
} from 'react';
import {
  AccessibilityInfo,
  AppState,
  BackHandler,
  Platform,
  SectionList,
  StyleSheet,
  View,
  findNodeHandle,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type SectionListData,
  type ViewProps,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type FrameCallback,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import {
  collectionOrderSignature,
  resolveAccessibilityStrings,
} from './accessibility';
import { accessibleReorderMove, reconcileReorder } from './semantic';
import {
  planSectionAutoScroll,
  resolveSectionListEngine,
  sectionAutoScrollDuration,
} from './section-list-engine';
import {
  applyExactChromeMeasurement,
  createSectionModel,
  createViewportSections,
  destinationAtSectionFrame,
  emptySectionDestinationAtOffset,
  remapSectionMeasurementQueue,
} from './section-list-model';
import type {
  ReorderableListSection,
  ReorderableSectionListProps,
  ReorderableSectionListRenderItemInfo,
} from './types';
import {
  applyMeasurement,
  contentLength,
  indexAtOffset,
  itemLength,
  itemOffset,
} from './virtualized-geometry';
import {
  assignViewportRef,
  useOwnedAnimatedScrollComponent,
} from './viewport-adapter';

const EMPTY_SELECTED_IDS: readonly string[] = [];
const LONG_PRESS_SLOP = 10;
const VIEWPORT_ITEM = Symbol('reorderable-section-list-item');

function resolveVerticalLength(
  value: unknown,
  viewportWidth: number,
  name: string
): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+(?:\.\d+)?%$/.test(value))
    return (Number.parseFloat(value) / 100) * viewportWidth;
  throw new Error(
    `[react-native-reorderable] contentContainerStyle.${name} must be a non-negative number or percentage.`
  );
}

const RESERVED_RUNTIME_PROPS = [
  'CellRendererComponent',
  'data',
  'maintainVisibleContentPosition',
  'renderScrollComponent',
] as const;
const NON_SECTION_LIST_PROPS = [
  'accessibilityStrings',
  'engine',
  'estimatedItemSize',
  'horizontal',
  'inverted',
  'numColumns',
] as const;

function renderOptionalComponent(
  component: unknown,
  props: Record<string, unknown>
): ReactNode {
  if (component == null) return null;
  if (isValidElement(component)) return component;
  return createElement(component as ComponentType, props);
}

const AnimatedSectionList = Animated.createAnimatedComponent(
  SectionList
) as unknown as typeof SectionList;

function assertSupportedProps(props: Record<string, unknown>): void {
  const supplied = new Set(Object.keys(props));
  for (const name of RESERVED_RUNTIME_PROPS) {
    if (supplied.has(name)) {
      throw new Error(
        `[react-native-reorderable] ReorderableSectionList owns the correctness-critical ${name} prop; remove it.`
      );
    }
  }
  if (supplied.has('horizontal')) {
    throw new Error(
      '[react-native-reorderable] ReorderableSectionList does not support horizontal lists in v1.'
    );
  }
  if (supplied.has('inverted')) {
    throw new Error(
      '[react-native-reorderable] ReorderableSectionList does not support inverted lists in v1.'
    );
  }
  if (supplied.has('numColumns')) {
    throw new Error(
      '[react-native-reorderable] ReorderableSectionList does not support multi-column lists in v1.'
    );
  }
}

function removeNonSectionListProps(
  props: Record<string, unknown>
): Record<string, unknown> {
  const safe = { ...props };
  for (const name of NON_SECTION_LIST_PROPS) delete safe[name];
  return safe;
}

function uniqueActionName(
  base: string,
  actions: NonNullable<ViewProps['accessibilityActions']>
): string {
  const names = new Set(actions.map((action) => action.name));
  let name = base;
  let suffix = 1;
  while (names.has(name)) name = `${base}.${suffix++}`;
  return name;
}

type CellProps<Item, Section> = Readonly<{
  activeFrameIndexes: SharedValue<readonly number[]>;
  activeTranslationY: SharedValue<number>;
  anchorCorrection: SharedValue<number>;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  collectionSize: number;
  frameIndex: number;
  id: string;
  index: number;
  item: Item;
  moveEarlierLabel: string;
  moveLaterLabel: string;
  onAccessibleMove: (id: string, direction: 'earlier' | 'later') => void;
  onMeasure: (identity: string, frameIndex: number, length: number) => void;
  registerAccessibleRef: (id: string, value: unknown) => void;
  renderItem: (
    info: ReorderableSectionListRenderItemInfo<Item, Section>
  ) => ReactElement | null;
  section: Section;
  selected: boolean;
}>;

function SectionCell<Item, Section>({
  activeFrameIndexes,
  activeTranslationY,
  anchorCorrection,
  canMoveEarlier,
  canMoveLater,
  collectionSize,
  frameIndex,
  id,
  index,
  item,
  moveEarlierLabel,
  moveLaterLabel,
  onAccessibleMove,
  onMeasure,
  registerAccessibleRef,
  renderItem,
  section,
  selected,
}: CellProps<Item, Section>) {
  const activeStyle = useAnimatedStyle(() => {
    const active = activeFrameIndexes.value.includes(frameIndex);
    return {
      elevation: active ? 8 : 0,
      opacity: active ? 0.94 : 1,
      transform: [
        {
          translateY: active
            ? activeTranslationY.value - anchorCorrection.value
            : 0,
        },
      ],
      zIndex: active ? 2 : 0,
    };
  }, [frameIndex]);
  const rendered = renderItem({ item, index, section });
  const renderedProps = isValidElement(rendered)
    ? (rendered.props as ViewProps)
    : {};
  const appActions = renderedProps.accessibilityActions ?? [];
  const earlierName = uniqueActionName('reorder-move-earlier', appActions);
  const laterName = uniqueActionName('reorder-move-later', appActions);
  const actions = [...appActions];
  if (canMoveEarlier)
    actions.push({ name: earlierName, label: moveEarlierLabel });
  if (canMoveLater) actions.push({ name: laterName, label: moveLaterLabel });
  return (
    <Animated.View
      accessible={renderedProps.accessible ?? true}
      accessibilityActions={actions}
      accessibilityElementsHidden={renderedProps.accessibilityElementsHidden}
      accessibilityHint={renderedProps.accessibilityHint}
      accessibilityIgnoresInvertColors={
        renderedProps.accessibilityIgnoresInvertColors
      }
      accessibilityLabel={renderedProps.accessibilityLabel}
      accessibilityLanguage={renderedProps.accessibilityLanguage}
      accessibilityLiveRegion={renderedProps.accessibilityLiveRegion}
      accessibilityRole={renderedProps.accessibilityRole}
      accessibilityState={{ ...renderedProps.accessibilityState, selected }}
      accessibilityValue={{
        ...renderedProps.accessibilityValue,
        min: 1,
        max: collectionSize,
        now: index + 1,
      }}
      accessibilityViewIsModal={renderedProps.accessibilityViewIsModal}
      importantForAccessibility={renderedProps.importantForAccessibility}
      onAccessibilityAction={(event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === earlierName)
          onAccessibleMove(id, 'earlier');
        else if (event.nativeEvent.actionName === laterName)
          onAccessibleMove(id, 'later');
        else renderedProps.onAccessibilityAction?.(event);
      }}
      onLayout={(event) =>
        onMeasure(`item:${id}`, frameIndex, event.nativeEvent.layout.height)
      }
      onAccessibilityTap={renderedProps.onAccessibilityTap}
      onMagicTap={renderedProps.onMagicTap}
      ref={(value: unknown) => registerAccessibleRef(id, value)}
      style={activeStyle}
      testID={`reorderable-section-list-wrapper-${id}`}
    >
      {rendered}
    </Animated.View>
  );
}

type ComponentProps<
  Item,
  Section extends ReorderableListSection<Item>,
> = ReorderableSectionListProps<Item, Section> &
  RefAttributes<SectionList<Item, Section>>;

type SectionViewportEntryRenderers = Readonly<{
  renderChrome: (input: {
    kind: 'footer' | 'header';
    section: unknown;
  }) => ReactNode;
  renderItem: (input: {
    item: unknown;
    itemIndex: number;
    section: unknown;
  }) => ReactNode;
  renderItemSeparator: (input: {
    frameIndex: number;
    identity: string;
    section: unknown;
  }) => ReactNode;
  renderSectionSeparator: (input: {
    edge: 'leading' | 'trailing';
    frameIndex: number;
    identity: string;
    section: unknown;
  }) => ReactNode;
}>;

export type SectionListViewportBridge = Readonly<{
  createEntries: (model: unknown) => readonly unknown[];
  createProviderProps: (
    options: Record<string, unknown>
  ) => Record<string, unknown>;
  createRef: (
    provider: Record<string, (...args: never[]) => unknown>,
    entries: readonly unknown[]
  ) => Record<string, unknown>;
  itemProviderIndex: (
    entries: readonly unknown[],
    sectionId: string,
    itemIndex: number
  ) => number;
  renderEntry: (
    entry: unknown,
    renderers: SectionViewportEntryRenderers
  ) => ReactNode;
  unwrapViewability: (
    info: {
      changed: readonly ViewabilityToken[];
      viewableItems: readonly ViewabilityToken[];
    },
    keyExtractor: (item: never, index: number, section: never) => string
  ) => { changed: ViewabilityToken[]; viewableItems: ViewabilityToken[] };
}>;

export type ReorderableSectionListViewportAdapter = Readonly<{
  bridge: SectionListViewportBridge;
  component: ComponentType<Record<string, unknown>>;
  displayName: string;
}>;

type ViewportItem<Item> = Readonly<{
  [VIEWPORT_ITEM]: true;
  id: string;
  index: number;
  value: Item;
}>;

type ViewabilityToken = Readonly<{
  index: number | undefined;
  isViewable: boolean;
  item: unknown;
  key: string;
  section?: unknown;
}>;

export function createSectionViewportItem<Item>(
  id: string,
  index: number,
  value: Item
): ViewportItem<Item> {
  return { [VIEWPORT_ITEM]: true, id, index, value };
}

export function unwrapSectionViewability<
  Item,
  Section extends ReorderableListSection<Item>,
>(
  info: {
    changed: readonly ViewabilityToken[];
    viewableItems: readonly ViewabilityToken[];
  },
  sectionById: ReadonlyMap<string, Section>
): { changed: ViewabilityToken[]; viewableItems: ViewabilityToken[] } {
  const unwrap = (token: ViewabilityToken): ViewabilityToken => {
    const item = token.item as ViewportItem<Item> | undefined;
    const sectionItem =
      token.item != null && typeof token.item === 'object'
        ? sectionById.get((token.item as { id?: string }).id ?? '')
        : undefined;
    const originalSection =
      token.section != null && typeof token.section === 'object'
        ? sectionById.get((token.section as { id?: string }).id ?? '')
        : undefined;
    if (item?.[VIEWPORT_ITEM] === true)
      return {
        ...token,
        index: item.index,
        item: item.value,
        section: originalSection,
      };
    return sectionItem == null
      ? token
      : {
          ...token,
          item: sectionItem,
          section: originalSection ?? sectionItem,
        };
  };
  return {
    changed: info.changed.map(unwrap),
    viewableItems: info.viewableItems.map(unwrap),
  };
}

export function ReorderableSectionList<
  Item,
  Section extends ReorderableListSection<Item>,
>(props: ComponentProps<Item, Section>) {
  return ReorderableSectionListRuntime(props);
}

export function ReorderableSectionListRuntime<
  Item,
  Section extends ReorderableListSection<Item>,
  ViewportRef = SectionList<Item, Section>,
>(
  props: ReorderableSectionListProps<Item, Section> &
    RefAttributes<ViewportRef>,
  viewportAdapter?: ReorderableSectionListViewportAdapter
) {
  assertSupportedProps(props as unknown as Record<string, unknown>);
  const {
    accessibilityStrings,
    enabled = true,
    engine = 'auto',
    estimatedItemSize,
    getItemLayout,
    ItemSeparatorComponent,
    keyExtractor,
    ListEmptyComponent,
    ListFooterComponent,
    ListFooterComponentStyle,
    ListHeaderComponent,
    ListHeaderComponentStyle,
    onLayout,
    onReorder,
    onScroll,
    onViewableItemsChanged,
    ref,
    renderItem,
    renderSectionFooter,
    renderSectionHeader,
    SectionSeparatorComponent,
    scrollEventThrottle = 16,
    sections,
    selectedIds: selectedIdsProp,
    viewabilityConfigCallbackPairs,
    ...remainingProps
  } = props as ReorderableSectionListProps<Item, Section> &
    RefAttributes<ViewportRef> &
    Record<string, unknown>;
  const sectionListEngine = resolveSectionListEngine(
    engine,
    Platform.OS,
    enabled
  );
  const [viewportWidth, setViewportWidth] = useState(0);
  const contentStyle = StyleSheet.flatten(
    remainingProps.contentContainerStyle as never
  ) as Record<string, unknown> | undefined;
  const listHeaderStyleSignature = JSON.stringify(
    StyleSheet.flatten(ListHeaderComponentStyle as never) ?? null
  );
  const listFooterStyleSignature = JSON.stringify(
    StyleSheet.flatten(ListFooterComponentStyle as never) ?? null
  );
  const sharedPadding = resolveVerticalLength(
    contentStyle?.padding,
    viewportWidth,
    'padding'
  );
  const verticalPadding =
    contentStyle?.paddingVertical != null
      ? resolveVerticalLength(
          contentStyle.paddingVertical,
          viewportWidth,
          'paddingVertical'
        )
      : sharedPadding;
  const contentPaddingTop =
    contentStyle?.paddingTop != null
      ? resolveVerticalLength(
          contentStyle.paddingTop,
          viewportWidth,
          'paddingTop'
        )
      : verticalPadding;
  const contentPaddingBottom =
    contentStyle?.paddingBottom != null
      ? resolveVerticalLength(
          contentStyle.paddingBottom,
          viewportWidth,
          'paddingBottom'
        )
      : verticalPadding;
  const contentGap = resolveVerticalLength(
    contentStyle?.rowGap ?? contentStyle?.gap,
    viewportWidth,
    contentStyle?.rowGap == null ? 'gap' : 'rowGap'
  );
  const chromeSignature = [
    ItemSeparatorComponent,
    ListEmptyComponent,
    ListFooterComponent,
    listFooterStyleSignature,
    ListHeaderComponent,
    listHeaderStyleSignature,
    SectionSeparatorComponent,
    contentPaddingBottom,
    contentGap,
    contentPaddingTop,
    renderSectionFooter,
    renderSectionHeader,
    ...sections.map(
      (section) =>
        (section as Section & { ItemSeparatorComponent?: unknown })
          .ItemSeparatorComponent
    ),
  ];
  const chromeSignatureRef = useRef<readonly unknown[]>([]);
  const chromeGenerationRef = useRef(0);
  if (
    chromeSignature.length !== chromeSignatureRef.current.length ||
    chromeSignature.some(
      (entry, index) => entry !== chromeSignatureRef.current[index]
    )
  ) {
    chromeSignatureRef.current = chromeSignature;
    chromeGenerationRef.current += 1;
  }
  const chromeGeneration = chromeGenerationRef.current;
  const selectedIds = selectedIdsProp ?? EMPTY_SELECTED_IDS;
  const model = useMemo(
    () =>
      createSectionModel(
        sections,
        keyExtractor,
        getItemLayout,
        estimatedItemSize,
        renderSectionHeader != null,
        renderSectionFooter != null,
        {
          generation: chromeGeneration,
          hasItemSeparator: ItemSeparatorComponent != null,
          hasListEmpty: ListEmptyComponent != null,
          hasListFooter: ListFooterComponent != null,
          hasListHeader: ListHeaderComponent != null,
          hasSectionSeparator: SectionSeparatorComponent != null,
          contentPaddingBottom,
          contentGap,
          contentPaddingTop,
        }
      ),
    [
      chromeGeneration,
      estimatedItemSize,
      getItemLayout,
      ItemSeparatorComponent,
      keyExtractor,
      ListEmptyComponent,
      ListFooterComponent,
      ListHeaderComponent,
      renderSectionFooter,
      renderSectionHeader,
      SectionSeparatorComponent,
      contentPaddingBottom,
      contentGap,
      contentPaddingTop,
      sections,
    ]
  );
  const providerEntries = useMemo<readonly unknown[]>(
    () => viewportAdapter?.bridge.createEntries(model) ?? [],
    [model, viewportAdapter]
  );
  const originalSection = useCallback(
    (section: SectionListData<Item, Section>) => {
      const id = (section as Section).id;
      const index = model.sectionIds.indexOf(id);
      if (index < 0)
        throw new Error(
          `[react-native-reorderable] SectionList returned unknown section id "${id}".`
        );
      return model.sections[index]!;
    },
    [model.sectionIds, model.sections]
  );
  const safeProps = removeNonSectionListProps(remainingProps);
  const sectionById = useMemo(
    () => new Map(model.sections.map((section) => [section.id, section])),
    [model.sections]
  );
  const unwrapViewability = useCallback(
    (info: {
      changed: readonly ViewabilityToken[];
      viewableItems: readonly ViewabilityToken[];
    }) => {
      return unwrapSectionViewability(info, sectionById);
    },
    [sectionById]
  );
  const unwrapProviderViewability = useCallback(
    (info: {
      changed: readonly ViewabilityToken[];
      viewableItems: readonly ViewabilityToken[];
    }) => {
      if (viewportAdapter == null) return unwrapViewability(info);
      return viewportAdapter.bridge.unwrapViewability(info, keyExtractor);
    },
    [keyExtractor, unwrapViewability, viewportAdapter]
  );
  const wrappedOnViewableItemsChanged = useMemo(
    () =>
      onViewableItemsChanged == null
        ? undefined
        : (info: never) =>
            onViewableItemsChanged(unwrapProviderViewability(info)),
    [onViewableItemsChanged, unwrapProviderViewability]
  );
  const wrappedViewabilityPairs = useMemo(
    () =>
      viewabilityConfigCallbackPairs?.map((pair) => ({
        ...pair,
        onViewableItemsChanged:
          pair.onViewableItemsChanged == null
            ? pair.onViewableItemsChanged
            : (info: never) =>
                pair.onViewableItemsChanged(unwrapProviderViewability(info)),
      })),
    [unwrapProviderViewability, viewabilityConfigCallbackPairs]
  );
  const resolvedStrings = useMemo(
    () => resolveAccessibilityStrings(accessibilityStrings),
    [accessibilityStrings]
  );
  const currentModel = useRef(model);
  const syncedModel = useRef(model);
  const syncedChromeGeneration = useRef(chromeGeneration);
  const currentSelected = useRef(selectedIds);
  const enabledRef = useRef(enabled);
  const onReorderRef = useRef(onReorder);
  currentModel.current = model;
  currentSelected.current = selectedIds;
  enabledRef.current = enabled;
  onReorderRef.current = onReorder;
  const accessibleRefs = useRef(new Map<string, unknown>());
  const sectionListRef = useRef<{
    scrollToIndex?: (params: Record<string, unknown>) => unknown;
    scrollToLocation?: (params: Record<string, unknown>) => unknown;
  } | null>(null);
  const pendingAccessibleOrder = useRef<string | null>(null);
  const animatedRef = useAnimatedRef<SectionList<Item, Section>>();
  const geometry = useSharedValue(model.geometry);
  const uiFrames = useSharedValue(model.frames);
  const uiEmptyRuns = useSharedValue(model.emptyRuns);
  const uiEmptyRunByFrameIndex = useSharedValue(model.emptyRunByFrameIndex);
  const uiSectionIds = useSharedValue(model.sectionIds);
  const uiItemsBySection = useSharedValue(
    model.order.map((entry) => entry.itemIds)
  );
  const uiSelectedIds = useSharedValue(selectedIds);
  const activeId = useSharedValue<string | null>(null);
  const activeFrameIndex = useSharedValue(-1);
  const activeSourceIds = useSharedValue<readonly string[]>([]);
  const activeFrameIndexes = useSharedValue<readonly number[]>([]);
  const activeTranslationY = useSharedValue(0);
  const anchorCorrection = useSharedValue(0);
  const gestureActivated = useSharedValue(false);
  const gestureOriginX = useSharedValue(0);
  const gestureOriginY = useSharedValue(0);
  const interactionStartY = useSharedValue(0);
  const pointerViewportY = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  const autoScrollOffset = useSharedValue(0);
  const autoScrollActive = useSharedValue(false);
  const destinationFrameIndex = useSharedValue(-1);
  const destinationSectionId = useSharedValue<string | null>(null);
  const destinationBeforeId = useSharedValue<string | null>(null);
  const feedbackViewportY = useSharedValue(0);
  const terminalSent = useSharedValue(true);
  const measurementQueue = useSharedValue<{
    cursor: number;
    generations: number[];
    identities: string[];
    indices: number[];
    lengths: number[];
  }>({ cursor: 0, generations: [], identities: [], indices: [], lengths: [] });

  const handleTerminal = useCallback(
    (
      cancelled: boolean,
      sourceIds: readonly string[],
      sectionId: string | null,
      beforeId: string | null
    ) => {
      if (cancelled || sectionId == null) return;
      const event = reconcileReorder(currentModel.current.order, sourceIds, {
        sectionId,
        beforeId,
      });
      if (event != null) onReorderRef.current(event);
    },
    []
  );
  const finish = useCallback(
    (
      cancelled: boolean,
      sourceIds: readonly string[],
      sectionId: string | null,
      beforeId: string | null
    ) => {
      'worklet';
      if (activeFrameIndex.value < 0 || terminalSent.value) return;
      terminalSent.value = true;
      activeId.value = null;
      activeFrameIndex.value = -1;
      activeSourceIds.value = [];
      activeFrameIndexes.value = [];
      activeTranslationY.value = 0;
      anchorCorrection.value = 0;
      gestureActivated.value = false;
      cancelAnimation(autoScrollOffset);
      autoScrollActive.value = false;
      destinationFrameIndex.value = -1;
      destinationSectionId.value = null;
      destinationBeforeId.value = null;
      scheduleOnRN(handleTerminal, cancelled, sourceIds, sectionId, beforeId);
    },
    [
      activeFrameIndex,
      activeFrameIndexes,
      activeId,
      activeSourceIds,
      activeTranslationY,
      anchorCorrection,
      autoScrollActive,
      autoScrollOffset,
      destinationBeforeId,
      destinationFrameIndex,
      destinationSectionId,
      gestureActivated,
      handleTerminal,
      terminalSent,
    ]
  );
  const cancel = useCallback(() => {
    scheduleOnUI(() => {
      'worklet';
      finish(true, [], null, null);
    });
  }, [finish]);
  const refreshDestination = useCallback(() => {
    'worklet';
    if (activeFrameIndex.value < 0 || viewportHeight.value <= 0) return;
    const contentY =
      scrollOffset.value +
      Math.max(0, Math.min(viewportHeight.value, pointerViewportY.value));
    const frameIndex = indexAtOffset(geometry.value, contentY, true).index;
    const emptyDestination = emptySectionDestinationAtOffset(
      geometry.value,
      uiEmptyRuns.value,
      uiEmptyRunByFrameIndex.value,
      uiSectionIds.value,
      frameIndex,
      contentY,
      viewportHeight.value
    );
    const destination =
      emptyDestination ??
      destinationAtSectionFrame(
        uiFrames.value,
        uiSectionIds.value,
        uiItemsBySection.value,
        frameIndex
      );
    destinationFrameIndex.value = destination == null ? -1 : frameIndex;
    destinationSectionId.value = destination?.sectionId ?? null;
    destinationBeforeId.value = destination?.beforeId ?? null;
    feedbackViewportY.value = Math.max(
      0,
      Math.min(
        viewportHeight.value,
        (emptyDestination?.feedbackOffset ??
          itemOffset(geometry.value, frameIndex)) - scrollOffset.value
      )
    );
  }, [
    activeFrameIndex,
    destinationBeforeId,
    destinationFrameIndex,
    destinationSectionId,
    feedbackViewportY,
    geometry,
    pointerViewportY,
    scrollOffset,
    uiFrames,
    uiEmptyRuns,
    uiEmptyRunByFrameIndex,
    uiItemsBySection,
    uiSectionIds,
    viewportHeight,
  ]);
  const updateAutoScroll = useCallback(() => {
    'worklet';
    cancelAnimation(autoScrollOffset);
    autoScrollOffset.value = scrollOffset.value;
    autoScrollActive.value = false;
    if (activeFrameIndex.value < 0 || viewportHeight.value <= 0) return;
    const plan = planSectionAutoScroll(
      pointerViewportY.value,
      viewportHeight.value,
      scrollOffset.value,
      contentLength(geometry.value)
    );
    if (!plan.active) return;
    autoScrollActive.value = true;
    autoScrollOffset.value = withTiming(
      plan.target,
      {
        duration: sectionAutoScrollDuration(plan, scrollOffset.value),
        easing: Easing.linear,
      },
      (finished) => {
        if (finished) autoScrollActive.value = false;
      }
    );
  }, [
    activeFrameIndex,
    autoScrollActive,
    autoScrollOffset,
    geometry,
    pointerViewportY,
    scrollOffset,
    viewportHeight,
  ]);
  useAnimatedReaction(
    () => (autoScrollActive.value ? autoScrollOffset.value : null),
    (offset) => {
      if (offset == null) return;
      scrollOffset.value = offset;
      scrollTo(animatedRef, 0, offset, false);
      refreshDestination();
    },
    [refreshDestination]
  );
  const frameLoopRef = useRef<FrameCallback | null>(null);
  const setFrameLoopActive = useCallback(
    (active: boolean) => frameLoopRef.current?.setActive(active),
    []
  );
  frameLoopRef.current = useFrameCallback(() => {
    'worklet';
    let pending = false;
    geometry.modify((current) => {
      const queue = measurementQueue.value;
      let consumed = 0;
      while (queue.cursor < queue.indices.length && consumed < 4) {
        const cursor = queue.cursor;
        const index = queue.indices[cursor]!;
        if (uiFrames.value[index]?.identity === queue.identities[cursor]) {
          const frameKind = uiFrames.value[index]?.kind;
          const currentGeneration =
            queue.generations[cursor] === chromeGeneration;
          if (frameKind !== 'item' && !currentGeneration) {
            // Ignore chrome measured by a renderer/style generation that was replaced.
          } else if (current.exact && frameKind !== 'item') {
            const before =
              activeFrameIndex.value < 0
                ? 0
                : itemOffset(current, activeFrameIndex.value);
            current = applyExactChromeMeasurement(
              current,
              index,
              queue.lengths[cursor]!
            );
            if (activeFrameIndex.value >= 0)
              anchorCorrection.value +=
                itemOffset(current, activeFrameIndex.value) - before;
          } else if (!current.exact) {
            const correction = applyMeasurement(
              current,
              index,
              queue.lengths[cursor]!,
              activeFrameIndex.value
            );
            anchorCorrection.value += correction.anchorDelta;
          }
        }
        queue.cursor += 1;
        consumed += 1;
      }
      if (queue.cursor === queue.indices.length && queue.cursor > 0) {
        queue.cursor = 0;
        queue.generations.length = 0;
        queue.identities.length = 0;
        queue.indices.length = 0;
        queue.lengths.length = 0;
      }
      pending = queue.cursor < queue.indices.length;
      return current;
    }, true);
    if (activeFrameIndex.value >= 0) refreshDestination();
    if (!pending) scheduleOnRN(setFrameLoopActive, false);
  }, false);

  const gestures = useMemo(() => {
    const nativeGesture = Gesture.Native();
    const reorderGesture = Gesture.LongPress()
      .withTestId('reorderable-section-list-viewport')
      .minDuration(350)
      .maxDistance(10_000)
      .cancelsTouchesInView(true)
      .onTouchesDown((event) => {
        const touch = event.allTouches[0];
        if (touch == null) return;
        gestureOriginX.value = touch.x;
        gestureOriginY.value = touch.y;
      })
      .onStart((event) => {
        'worklet';
        if (sectionListEngine !== 'fallback' || viewportHeight.value <= 0)
          return;
        const frameIndex = indexAtOffset(
          geometry.value,
          scrollOffset.value + event.y
        ).index;
        const frame = uiFrames.value[frameIndex];
        if (frame?.itemId == null) return;
        activeId.value = frame.itemId;
        activeFrameIndex.value = frameIndex;
        const knownIds = uiFrames.value.flatMap((candidate) =>
          candidate.itemId == null ? [] : [candidate.itemId]
        );
        const sourceIds = uiSelectedIds.value.includes(frame.itemId)
          ? knownIds.filter((id) => uiSelectedIds.value.includes(id))
          : [frame.itemId];
        activeSourceIds.value = sourceIds;
        activeFrameIndexes.value = uiFrames.value
          .map((candidate, index) =>
            candidate.itemId != null && sourceIds.includes(candidate.itemId)
              ? index
              : -1
          )
          .filter((index) => index >= 0);
        activeTranslationY.value = 0;
        anchorCorrection.value = 0;
        gestureActivated.value = true;
        interactionStartY.value = event.y;
        pointerViewportY.value = event.y;
        terminalSent.value = false;
        refreshDestination();
        updateAutoScroll();
      })
      .onTouchesMove((event, state) => {
        'worklet';
        const touch = event.allTouches[0];
        if (touch == null) return;
        if (
          !gestureActivated.value &&
          Math.hypot(
            touch.x - gestureOriginX.value,
            touch.y - gestureOriginY.value
          ) > LONG_PRESS_SLOP
        ) {
          state.fail();
        } else if (gestureActivated.value) {
          pointerViewportY.value = touch.y;
          activeTranslationY.value = touch.y - interactionStartY.value;
          refreshDestination();
          updateAutoScroll();
        }
      })
      .onEnd((event) => {
        'worklet';
        if (activeFrameIndex.value < 0 || terminalSent.value) return;
        pointerViewportY.value = event.y;
        refreshDestination();
        finish(
          event.y < 0 ||
            event.y > viewportHeight.value ||
            destinationFrameIndex.value < 0,
          activeSourceIds.value,
          destinationSectionId.value,
          destinationBeforeId.value
        );
      })
      .onFinalize((_event, success) => {
        'worklet';
        gestureActivated.value = false;
        if (!success) finish(true, [], null, null);
      })
      .blocksExternalGesture(nativeGesture);
    return { nativeGesture, reorderGesture };
  }, [
    activeFrameIndex,
    activeFrameIndexes,
    activeId,
    activeSourceIds,
    activeTranslationY,
    anchorCorrection,
    destinationBeforeId,
    destinationFrameIndex,
    destinationSectionId,
    sectionListEngine,
    finish,
    geometry,
    gestureActivated,
    gestureOriginX,
    gestureOriginY,
    interactionStartY,
    pointerViewportY,
    refreshDestination,
    scrollOffset,
    terminalSent,
    uiFrames,
    uiSelectedIds,
    updateAutoScroll,
    viewportHeight,
  ]);

  useEffect(() => {
    if (syncedModel.current === model) return;
    syncedModel.current = model;
    const preserveChromeMeasurements =
      syncedChromeGeneration.current === chromeGeneration;
    syncedChromeGeneration.current = chromeGeneration;
    scheduleOnUI(() => {
      'worklet';
      const nextFrameByIdentity: Record<string, number> = {};
      model.frames.forEach((frame, index) => {
        nextFrameByIdentity[`identity:${frame.identity}`] = index;
      });
      measurementQueue.value = remapSectionMeasurementQueue(
        measurementQueue.value,
        model.frames
      );
      const oldGeometry = geometry.value;
      const oldFrames = uiFrames.value;
      let replacement = model.geometry;
      if (!oldGeometry.exact && !replacement.exact) {
        for (let index = 0; index < oldFrames.length; index += 1) {
          if (oldGeometry.measuredFlags[index] !== 1) continue;
          const nextIndex =
            nextFrameByIdentity[`identity:${oldFrames[index]!.identity}`];
          if (
            nextIndex != null &&
            model.chromePresentFlags[nextIndex] === 1 &&
            (oldFrames[index]?.kind === 'item' || preserveChromeMeasurements)
          )
            applyMeasurement(
              replacement,
              nextIndex,
              oldGeometry.measuredSizes[index]!
            );
        }
      } else if (oldGeometry.exact && replacement.exact) {
        for (let index = 0; index < oldFrames.length; index += 1) {
          if (
            oldGeometry.anchorFlags[index] === 1 ||
            oldGeometry.measuredFlags[index] !== 1
          )
            continue;
          const nextIndex =
            nextFrameByIdentity[`identity:${oldFrames[index]!.identity}`];
          if (
            nextIndex != null &&
            model.chromePresentFlags[nextIndex] === 1 &&
            preserveChromeMeasurements
          )
            applyExactChromeMeasurement(
              replacement,
              nextIndex,
              itemLength(oldGeometry, index)
            );
        }
      }
      if (activeFrameIndex.value >= 0) {
        const previousDestinationSection = destinationSectionId.value;
        const previousDestinationBefore = destinationBeforeId.value;
        const destinationStillValid =
          previousDestinationSection == null ||
          model.order.some(
            (entry) =>
              entry.sectionId === previousDestinationSection &&
              (previousDestinationBefore == null ||
                entry.itemIds.includes(previousDestinationBefore))
          );
        const id = activeId.value;
        const nextActive =
          id == null ? null : model.itemFrameById[`identity:${id}`];
        const nextSources = activeSourceIds.value.map(
          (sourceId) => model.itemFrameById[`identity:${sourceId}`]
        );
        if (
          !destinationStillValid ||
          nextActive == null ||
          nextSources.some((index) => index == null)
        ) {
          finish(true, [], null, null);
        } else {
          anchorCorrection.value +=
            itemOffset(replacement, nextActive) -
            itemOffset(oldGeometry, activeFrameIndex.value);
          activeFrameIndex.value = nextActive;
          activeFrameIndexes.value = nextSources as number[];
        }
      }
      geometry.value = replacement;
      uiFrames.value = model.frames;
      uiEmptyRuns.value = model.emptyRuns;
      uiEmptyRunByFrameIndex.value = model.emptyRunByFrameIndex;
      uiSectionIds.value = model.sectionIds;
      uiItemsBySection.value = model.order.map((entry) => entry.itemIds);
      if (activeFrameIndex.value >= 0) refreshDestination();
    });
  }, [
    activeFrameIndex,
    activeFrameIndexes,
    activeId,
    activeSourceIds,
    anchorCorrection,
    destinationBeforeId,
    destinationSectionId,
    finish,
    geometry,
    measurementQueue,
    model,
    chromeGeneration,
    refreshDestination,
    uiFrames,
    uiEmptyRuns,
    uiEmptyRunByFrameIndex,
    uiItemsBySection,
    uiSectionIds,
  ]);
  useEffect(() => {
    scheduleOnUI(() => {
      'worklet';
      uiSelectedIds.value = selectedIds;
    });
  }, [selectedIds, uiSelectedIds]);
  useEffect(() => {
    if (!enabled) cancel();
  }, [cancel, enabled]);
  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cancel();
    });
    const blur =
      Platform.OS === 'android'
        ? AppState.addEventListener('blur', cancel)
        : null;
    const back =
      Platform.OS === 'android'
        ? BackHandler.addEventListener('hardwareBackPress', () => {
            if (activeFrameIndex.get() < 0) return false;
            cancel();
            return true;
          })
        : null;
    return () => {
      appState.remove();
      blur?.remove();
      back?.remove();
      cancel();
    };
  }, [activeFrameIndex, cancel]);

  const registerAccessibleRef = useCallback((id: string, value: unknown) => {
    if (value == null) accessibleRefs.current.delete(id);
    else accessibleRefs.current.set(id, value);
  }, []);
  const focusItem = useCallback(
    (id: string) => {
      setTimeout(() => {
        const order = currentModel.current.order;
        const sectionIndex = order.findIndex((entry) =>
          entry.itemIds.includes(id)
        );
        const itemIndex = order[sectionIndex]?.itemIds.indexOf(id) ?? -1;
        if (sectionIndex >= 0 && itemIndex >= 0) {
          if (viewportAdapter == null)
            sectionListRef.current?.scrollToLocation?.({
              animated: false,
              itemIndex,
              sectionIndex,
              viewPosition: 0.5,
            });
          else {
            const providerIndex = viewportAdapter.bridge.itemProviderIndex(
              providerEntries,
              order[sectionIndex]!.sectionId ?? '',
              itemIndex
            );
            if (providerIndex >= 0)
              sectionListRef.current?.scrollToIndex?.({
                animated: false,
                index: providerIndex,
                viewPosition: 0.5,
              });
          }
        }
        const tag = findNodeHandle(accessibleRefs.current.get(id));
        if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag);
      }, 0);
    },
    [providerEntries, viewportAdapter]
  );
  const handleAccessibleMove = useCallback(
    (id: string, direction: 'earlier' | 'later') => {
      if (!enabledRef.current) {
        AccessibilityInfo.announceForAccessibility(
          resolvedStrings.unavailableAnnouncement
        );
        focusItem(id);
        return;
      }
      const move = accessibleReorderMove(
        currentModel.current.order,
        id,
        currentSelected.current,
        direction
      );
      const event =
        move == null
          ? null
          : reconcileReorder(
              currentModel.current.order,
              move.sourceIds,
              move.destination
            );
      if (event == null) {
        AccessibilityInfo.announceForAccessibility(
          resolvedStrings.unavailableAnnouncement
        );
        focusItem(id);
        return;
      }
      pendingAccessibleOrder.current = collectionOrderSignature(
        event.nextOrder
      );
      onReorderRef.current(event);
      setTimeout(() => {
        const expected = pendingAccessibleOrder.current;
        if (expected == null) return;
        pendingAccessibleOrder.current = null;
        if (expected !== collectionOrderSignature(currentModel.current.order))
          AccessibilityInfo.announceForAccessibility(
            resolvedStrings.orderCorrectedAnnouncement
          );
      }, 0);
      const destination = event.nextOrder.find(
        (entry) => entry.sectionId === event.destination.sectionId
      )!;
      AccessibilityInfo.announceForAccessibility(
        resolvedStrings.reorderAnnouncement({
          event,
          position: destination.itemIds.indexOf(event.sourceIds[0]!) + 1,
          collectionSize: destination.itemIds.length,
        })
      );
      focusItem(id);
    },
    [focusItem, resolvedStrings]
  );
  const currentSignature = collectionOrderSignature(model.order);
  useEffect(() => {
    const expected = pendingAccessibleOrder.current;
    if (expected == null) return;
    pendingAccessibleOrder.current = null;
    if (expected !== currentSignature)
      AccessibilityInfo.announceForAccessibility(
        resolvedStrings.orderCorrectedAnnouncement
      );
  });

  const handleMeasure = useCallback(
    (identity: string, frameIndex: number, length: number) => {
      if (!Number.isFinite(length) || length < 0) return;
      scheduleOnUI(() => {
        'worklet';
        measurementQueue.modify((queue) => {
          queue.generations.push(chromeGeneration);
          queue.identities.push(identity);
          queue.indices.push(frameIndex);
          queue.lengths.push(length);
          return queue;
        }, true);
        scheduleOnRN(setFrameLoopActive, true);
      });
    },
    [chromeGeneration, measurementQueue, setFrameLoopActive]
  );
  const measuredListHeader = useMemo(
    () =>
      ListHeaderComponent == null
        ? undefined
        : function MeasuredListHeader(componentProps: Record<string, unknown>) {
            const frameIndex = model.frameByIdentity['identity:list:header']!;
            return (
              <View
                onLayout={(event) =>
                  handleMeasure(
                    'list:header',
                    frameIndex,
                    event.nativeEvent.layout.height
                  )
                }
                testID="reorderable-section-list-list-header"
              >
                <View style={ListHeaderComponentStyle as never}>
                  {renderOptionalComponent(ListHeaderComponent, componentProps)}
                </View>
              </View>
            );
          },
    [
      ListHeaderComponent,
      ListHeaderComponentStyle,
      handleMeasure,
      model.frameByIdentity,
    ]
  );
  const measuredListFooter = useMemo(
    () =>
      ListFooterComponent == null
        ? undefined
        : function MeasuredListFooter(componentProps: Record<string, unknown>) {
            const frameIndex = model.frameByIdentity['identity:list:footer']!;
            return (
              <View
                onLayout={(event) =>
                  handleMeasure(
                    'list:footer',
                    frameIndex,
                    event.nativeEvent.layout.height
                  )
                }
                testID="reorderable-section-list-list-footer"
              >
                <View style={ListFooterComponentStyle as never}>
                  {renderOptionalComponent(ListFooterComponent, componentProps)}
                </View>
              </View>
            );
          },
    [
      ListFooterComponent,
      ListFooterComponentStyle,
      handleMeasure,
      model.frameByIdentity,
    ]
  );
  const measuredListEmpty = useMemo(
    () =>
      ListEmptyComponent == null
        ? undefined
        : function MeasuredListEmpty(componentProps: Record<string, unknown>) {
            const frameIndex = model.frameByIdentity['identity:list:empty']!;
            return (
              <View
                onLayout={(event) =>
                  handleMeasure(
                    'list:empty',
                    frameIndex,
                    event.nativeEvent.layout.height
                  )
                }
              >
                {renderOptionalComponent(ListEmptyComponent, componentProps)}
              </View>
            );
          },
    [ListEmptyComponent, handleMeasure, model.frameByIdentity]
  );
  const measuredItemSeparator = useMemo(
    () =>
      ItemSeparatorComponent == null &&
      !sections.some(
        (section) =>
          (section as Section & { ItemSeparatorComponent?: unknown })
            .ItemSeparatorComponent != null
      )
        ? undefined
        : function MeasuredItemSeparator(
            componentProps: Record<string, unknown>
          ) {
            const viewportSection = componentProps.section as SectionListData<
              ViewportItem<Item>,
              Section
            >;
            const section = originalSection(viewportSection);
            const leadingItem = componentProps.leadingItem as
              ViewportItem<Item> | undefined;
            const leadingId = leadingItem?.id ?? null;
            const identity = `section:${section.id}:item-separator:${leadingId ?? ''}`;
            const frameIndex = model.frameByIdentity[`identity:${identity}`]!;
            const component =
              (section as Section & { ItemSeparatorComponent?: unknown })
                .ItemSeparatorComponent ?? ItemSeparatorComponent;
            const applicationProps = {
              ...componentProps,
              leadingItem: leadingItem?.value,
              section,
              trailingItem: (
                componentProps.trailingItem as ViewportItem<Item> | undefined
              )?.value,
            };
            return (
              <View
                onLayout={(event) =>
                  handleMeasure(
                    identity,
                    frameIndex,
                    event.nativeEvent.layout.height
                  )
                }
                testID={`reorderable-section-list-item-separator-${leadingId ?? 'unknown'}`}
              >
                {renderOptionalComponent(component, applicationProps)}
              </View>
            );
          },
    [
      ItemSeparatorComponent,
      handleMeasure,
      model.frameByIdentity,
      originalSection,
      sections,
    ]
  );
  const measuredSectionSeparator = useMemo(
    () =>
      SectionSeparatorComponent == null
        ? undefined
        : function MeasuredSectionSeparator(
            componentProps: Record<string, unknown>
          ) {
            const section = originalSection(
              componentProps.section as SectionListData<Item, Section>
            );
            const edge =
              componentProps.trailingItem == null ? 'trailing' : 'leading';
            const identity = `section:${section.id}:section-separator:${edge}`;
            const frameIndex = model.frameByIdentity[`identity:${identity}`]!;
            const applicationProps = {
              ...componentProps,
              leadingItem: (
                componentProps.leadingItem as ViewportItem<Item> | undefined
              )?.value,
              section,
              trailingItem: (
                componentProps.trailingItem as ViewportItem<Item> | undefined
              )?.value,
            };
            return (
              <View
                onLayout={(event) =>
                  handleMeasure(
                    identity,
                    frameIndex,
                    event.nativeEvent.layout.height
                  )
                }
              >
                {renderOptionalComponent(
                  SectionSeparatorComponent,
                  applicationProps
                )}
              </View>
            );
          },
    [
      SectionSeparatorComponent,
      handleMeasure,
      model.frameByIdentity,
      originalSection,
    ]
  );
  const viewportSections = useMemo(
    () =>
      createViewportSections(sections, keyExtractor).map((section) => {
        const hasOwnedSeparator =
          (section as Section & { ItemSeparatorComponent?: unknown })
            .ItemSeparatorComponent != null;
        return {
          ...section,
          data: section.data.map((value, index) => ({
            ...createSectionViewportItem(
              keyExtractor(value, index, section),
              index,
              value
            ),
          })),
          ItemSeparatorComponent: hasOwnedSeparator
            ? measuredItemSeparator
            : (section as Section & { ItemSeparatorComponent?: unknown })
                .ItemSeparatorComponent,
          keyExtractor: (item: ViewportItem<Item>) => item.id,
          key: section.id,
          renderItem: undefined,
        };
      }),
    [keyExtractor, measuredItemSeparator, sections]
  );
  const renderChrome = useCallback(
    (
      kind: 'header' | 'footer',
      viewportSection: SectionListData<Item, Section>
    ) => {
      const section = originalSection(viewportSection);
      const frameIndex =
        model.frameByIdentity[`identity:section:${section.id}:${kind}`]!;
      const rendered =
        kind === 'header'
          ? renderSectionHeader?.({ section })
          : renderSectionFooter?.({ section });
      return (
        <View
          onLayout={(event) =>
            handleMeasure(
              `section:${section.id}:${kind}`,
              frameIndex,
              event.nativeEvent.layout.height
            )
          }
          testID={`reorderable-section-list-${kind}-${section.id}`}
        >
          {rendered}
        </View>
      );
    },
    [
      handleMeasure,
      model.frameByIdentity,
      originalSection,
      renderSectionFooter,
      renderSectionHeader,
    ]
  );
  const handleRenderItem = useCallback(
    ({
      item,
      section,
    }: {
      item: ViewportItem<Item>;
      section: SectionListData<Item, Section>;
    }) => {
      const typedSection = originalSection(section);
      const id = item.id;
      const frameIndex = model.itemFrameById[`identity:${id}`]!;
      const collection = model.order.find(
        (entry) => entry.sectionId === typedSection.id
      )!;
      const applicationRenderItem =
        (
          typedSection as Section & {
            renderItem?: typeof renderItem;
          }
        ).renderItem ?? renderItem;
      return (
        <SectionCell
          activeFrameIndexes={activeFrameIndexes}
          activeTranslationY={activeTranslationY}
          anchorCorrection={anchorCorrection}
          canMoveEarlier={
            enabled &&
            accessibleReorderMove(model.order, id, selectedIds, 'earlier') !=
              null
          }
          canMoveLater={
            enabled &&
            accessibleReorderMove(model.order, id, selectedIds, 'later') != null
          }
          collectionSize={collection.itemIds.length}
          frameIndex={frameIndex}
          id={id}
          index={item.index}
          item={item.value}
          moveEarlierLabel={resolvedStrings.moveEarlierAction}
          moveLaterLabel={resolvedStrings.moveLaterAction}
          onAccessibleMove={handleAccessibleMove}
          onMeasure={handleMeasure}
          registerAccessibleRef={registerAccessibleRef}
          renderItem={applicationRenderItem}
          section={typedSection}
          selected={selectedIds.includes(id)}
        />
      );
    },
    [
      activeFrameIndexes,
      activeTranslationY,
      anchorCorrection,
      enabled,
      handleAccessibleMove,
      handleMeasure,
      model,
      originalSection,
      registerAccessibleRef,
      renderItem,
      resolvedStrings,
      selectedIds,
    ]
  );
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeight.value = event.nativeEvent.layout.height;
      setViewportWidth(event.nativeEvent.layout.width);
      onLayout?.(event);
    },
    [onLayout, viewportHeight]
  );
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffset.value = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll, scrollOffset]
  );
  const handleRef = useCallback(
    (value: SectionList<Item, Section> | ViewportRef | null) => {
      sectionListRef.current = value as typeof sectionListRef.current;
      if (viewportAdapter == null)
        animatedRef(value as SectionList<Item, Section>);
      assignViewportRef(
        ref as Ref<unknown>,
        viewportAdapter == null || value == null
          ? value
          : viewportAdapter.bridge.createRef(
              value as Record<string, (...args: never[]) => unknown>,
              providerEntries
            )
      );
    },
    [animatedRef, providerEntries, ref, viewportAdapter]
  );
  const ownedScrollComponent = useOwnedAnimatedScrollComponent(animatedRef);
  const feedbackStyle = useAnimatedStyle(() => ({
    opacity: destinationFrameIndex.value < 0 ? 0 : 1,
    transform: [{ translateY: feedbackViewportY.value }],
  }));

  const renderProviderEntry = useCallback(
    ({ item: entry }: { item: unknown }) =>
      viewportAdapter?.bridge.renderEntry(entry, {
        renderItem: ({ item, itemIndex, section }) =>
          handleRenderItem({
            item: createSectionViewportItem(
              keyExtractor(item as Item, itemIndex, section as Section),
              itemIndex,
              item as Item
            ),
            section: section as SectionListData<Item, Section>,
          }),
        renderChrome: ({ kind, section }) =>
          renderChrome(kind, section as SectionListData<Item, Section>),
        renderItemSeparator: ({ frameIndex, identity, section }) => {
          const typedSection = section as Section;
          const sectionIndex = model.sectionIds.indexOf(typedSection.id);
          const ids = model.order[sectionIndex]?.itemIds ?? [];
          const nextIndex = ids.indexOf(
            model.frames[frameIndex]?.destinationBeforeId ?? ''
          );
          const leadingIndex = Math.max(0, nextIndex - 1);
          const component =
            (typedSection as Section & { ItemSeparatorComponent?: unknown })
              .ItemSeparatorComponent ?? ItemSeparatorComponent;
          return (
            <View
              onLayout={(event) =>
                handleMeasure(
                  identity,
                  frameIndex,
                  event.nativeEvent.layout.height
                )
              }
            >
              {renderOptionalComponent(component, {
                leadingItem: typedSection.data[leadingIndex],
                section: typedSection,
                trailingItem: typedSection.data[nextIndex],
              })}
            </View>
          );
        },
        renderSectionSeparator: ({ edge, frameIndex, identity, section }) => {
          const typedSection = section as Section;
          return (
            <View
              onLayout={(event) =>
                handleMeasure(
                  identity,
                  frameIndex,
                  event.nativeEvent.layout.height
                )
              }
            >
              {renderOptionalComponent(SectionSeparatorComponent, {
                leadingItem:
                  edge === 'trailing'
                    ? typedSection.data[typedSection.data.length - 1]
                    : undefined,
                section: typedSection,
                trailingItem:
                  edge === 'leading' ? typedSection.data[0] : undefined,
              })}
            </View>
          );
        },
      }) ?? null,
    [
      handleMeasure,
      handleRenderItem,
      ItemSeparatorComponent,
      keyExtractor,
      model,
      renderChrome,
      SectionSeparatorComponent,
      viewportAdapter?.bridge,
    ]
  );

  let viewport: ReactElement;
  if (viewportAdapter == null) {
    viewport = (
      <AnimatedSectionList<Item, Section>
        {...safeProps}
        ItemSeparatorComponent={measuredItemSeparator}
        ListEmptyComponent={measuredListEmpty}
        ListFooterComponent={measuredListFooter}
        ListHeaderComponent={measuredListHeader}
        SectionSeparatorComponent={measuredSectionSeparator}
        getItemLayout={
          getItemLayout == null
            ? undefined
            : (
                _data: ArrayLike<SectionListData<Item, Section>> | null,
                index: number
              ) => {
                const frameIndex =
                  model.viewportFrameIndices[index] ?? model.geometry.count;
                const nextFrameIndex =
                  model.viewportFrameIndices[index + 1] ?? model.geometry.count;
                return {
                  index,
                  length:
                    itemOffset(model.geometry, nextFrameIndex) -
                    itemOffset(model.geometry, frameIndex),
                  offset: itemOffset(model.geometry, frameIndex),
                };
              }
        }
        keyExtractor={() => {
          throw new Error(
            '[react-native-reorderable] SectionList bypassed its owned section-aware key extractor.'
          );
        }}
        onLayout={handleLayout}
        onScroll={handleScroll}
        onViewableItemsChanged={wrappedOnViewableItemsChanged as never}
        ref={handleRef}
        renderItem={handleRenderItem as never}
        renderSectionFooter={({ section }) => renderChrome('footer', section)}
        renderSectionHeader={({ section }) => renderChrome('header', section)}
        scrollEventThrottle={scrollEventThrottle}
        sections={viewportSections as Section[]}
        viewabilityConfigCallbackPairs={wrappedViewabilityPairs as never}
      />
    );
  } else {
    const ProviderComponent = viewportAdapter.component;
    viewport = createElement(
      ProviderComponent,
      viewportAdapter.bridge.createProviderProps({
        entries: providerEntries,
        listEmpty: measuredListEmpty,
        listFooter: measuredListFooter,
        listHeader: measuredListHeader,
        onLayout: handleLayout,
        onScroll: handleScroll,
        onViewableItemsChanged: wrappedOnViewableItemsChanged,
        providerProps: safeProps,
        ref: handleRef,
        renderItem: renderProviderEntry,
        renderScrollComponent: ownedScrollComponent,
        scrollEventThrottle,
        viewabilityConfigCallbackPairs: wrappedViewabilityPairs,
      })
    );
  }

  return (
    <View style={styles.viewportContainer}>
      <GestureDetector gesture={gestures.reorderGesture}>
        <View collapsable={false} style={styles.gestureSurface}>
          <GestureDetector gesture={gestures.nativeGesture}>
            {viewport}
          </GestureDetector>
        </View>
      </GestureDetector>
      <Animated.View
        pointerEvents="none"
        style={[styles.destinationFeedback, feedbackStyle]}
        testID="reorderable-section-list-destination-feedback"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  destinationFeedback: {
    backgroundColor: '#0A84FF',
    height: 3,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 3,
  },
  gestureSurface: { flex: 1 },
  viewportContainer: { flex: 1, position: 'relative' },
});
