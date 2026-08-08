import {
  LegendList,
  type LegendListProps,
  type LegendListRef,
} from '@legendapp/list/react-native';
import {
  SectionList as LegendSectionList,
  type SectionListProps as LegendSectionListProps,
  type SectionListRef as LegendSectionListRef,
} from '@legendapp/list/section-list';
import {
  createElement,
  type ComponentType,
  type ReactElement,
  type RefAttributes,
} from 'react';

import {
  ReorderableListRuntime,
  type ReorderableListViewportAdapter,
} from './reorderable-list';
import { ReorderableSectionListRuntime } from './reorderable-section-list';
import type {
  AccessibilityStrings,
  EnginePolicy,
  ReorderEvent,
  ReorderableItemLayout,
  ReorderableListRenderItemInfo,
  ReorderableListSection,
  ReorderableSectionListRenderItemInfo,
} from './types';

type LegendOwnedProp =
  | 'CellRendererComponent'
  | 'children'
  | 'data'
  | 'getFixedItemSize'
  | 'getItemType'
  | 'horizontal'
  | 'inverted'
  | 'keyExtractor'
  | 'maintainVisibleContentPosition'
  | 'numColumns'
  | 'refScrollView'
  | 'renderItem'
  | 'renderScrollComponent';

export type ReorderableLegendListProps<Item> = Omit<
  LegendListProps<Item>,
  LegendOwnedProp
> & {
  accessibilityStrings?: Partial<AccessibilityStrings>;
  data: readonly Item[];
  enabled?: boolean;
  engine?: EnginePolicy;
  estimatedItemSize?: number;
  getItemLayout?: (
    data: readonly Item[],
    index: number
  ) => ReorderableItemLayout;
  keyExtractor: (item: Item, index: number) => string;
  onReorder: (event: ReorderEvent) => void;
  renderItem: (
    info: ReorderableListRenderItemInfo<Item>
  ) => ReactElement | null;
  selectedIds?: readonly string[];
} & RefAttributes<LegendListRef>;

const legendListAdapter: ReorderableListViewportAdapter = {
  component: LegendList as never,
  createProps: ({ data, estimatedItemSize, getItemLayout, viewportProps }) => {
    const OwnedScrollComponent = viewportProps.renderScrollComponent as
      ComponentType<Record<string, unknown>> | undefined;
    return {
      ...viewportProps,
      estimatedItemSize,
      getFixedItemSize:
        getItemLayout == null
          ? undefined
          : (_item: unknown, index: number) =>
              getItemLayout(data, index).length,
      maintainVisibleContentPosition: false,
      renderScrollComponent:
        OwnedScrollComponent == null
          ? undefined
          : (scrollProps: Record<string, unknown>) =>
              createElement(OwnedScrollComponent, scrollProps),
    };
  },
  displayName: 'ReorderableLegendList',
  reservedProps: [
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
  ],
};

export function ReorderableLegendList<Item>(
  props: ReorderableLegendListProps<Item>
) {
  return ReorderableListRuntime(props as never, legendListAdapter);
}

type LegendSectionOwnedProp =
  | LegendOwnedProp
  | 'itemsAreEqual'
  | 'onFirstVisibleItemChanged'
  | 'onItemSizeChanged'
  | 'onStickyHeaderChange'
  | 'overrideItemLayout'
  | 'sections'
  | 'renderSectionFooter'
  | 'renderSectionHeader'
  | 'viewabilityConfigCallbackPairs';

export type ReorderableLegendSectionListProps<
  Item,
  Section extends ReorderableListSection<Item>,
> = Omit<LegendSectionListProps<Item, Section>, LegendSectionOwnedProp> & {
  accessibilityStrings?: Partial<AccessibilityStrings>;
  enabled?: boolean;
  engine?: EnginePolicy;
  estimatedItemSize?: number;
  getItemLayout?: (
    sections: readonly Section[],
    sectionIndex: number,
    itemIndex: number
  ) => Omit<ReorderableItemLayout, 'index'>;
  keyExtractor: (item: Item, index: number, section: Section) => string;
  onReorder: (event: ReorderEvent) => void;
  renderItem: (
    info: ReorderableSectionListRenderItemInfo<Item, Section>
  ) => ReactElement | null;
  renderSectionFooter?: (
    info: Readonly<{ section: Section }>
  ) => ReactElement | null;
  renderSectionHeader?: (
    info: Readonly<{ section: Section }>
  ) => ReactElement | null;
  sections: readonly Section[];
  selectedIds?: readonly string[];
} & RefAttributes<LegendSectionListRef>;

export function ReorderableLegendSectionList<
  Item,
  Section extends ReorderableListSection<Item>,
>(props: ReorderableLegendSectionListProps<Item, Section>) {
  return ReorderableSectionListRuntime(props as never, legendSectionAdapter);
}

const legendSectionAdapter = {
  component: LegendSectionList as never,
  createProps: ({
    estimatedItemSize,
    getItemLayout,
    sections,
    viewportProps,
  }: {
    estimatedItemSize: number | undefined;
    getItemLayout:
      | ((
          sections: readonly unknown[],
          sectionIndex: number,
          itemIndex: number
        ) => Omit<ReorderableItemLayout, 'index'>)
      | undefined;
    sections: readonly unknown[];
    viewportProps: Record<string, unknown>;
  }) => {
    const OwnedScrollComponent = viewportProps.renderScrollComponent as
      ComponentType<Record<string, unknown>> | undefined;
    return {
      ...viewportProps,
      estimatedItemSize,
      getFixedItemSize:
        getItemLayout == null
          ? undefined
          : (info: {
              index?: number;
              section?: { id?: string };
              type: string;
            }) => {
              if (info.type !== 'item' || info.index == null) return undefined;
              const sectionIndex = sections.findIndex(
                (section) =>
                  (section as { id?: string }).id === info.section?.id
              );
              return sectionIndex < 0
                ? undefined
                : getItemLayout(sections, sectionIndex, info.index).length;
            },
      maintainVisibleContentPosition: false,
      renderScrollComponent:
        OwnedScrollComponent == null
          ? undefined
          : (scrollProps: Record<string, unknown>) =>
              createElement(OwnedScrollComponent, scrollProps),
    };
  },
  displayName: 'ReorderableLegendSectionList',
  reservedProps: [
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
  ],
} as const;
