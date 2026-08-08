import {
  FlashList,
  type FlashListProps,
  type FlashListRef,
} from '@shopify/flash-list';
import type { ReactElement, RefAttributes } from 'react';

import {
  ReorderableListRuntime,
  type ReorderableListViewportAdapter,
} from './reorderable-list';
import {
  ReorderableSectionListRuntime,
  type ReorderableSectionListViewportAdapter,
} from './reorderable-section-list';
import type {
  AccessibilityStrings,
  EnginePolicy,
  ReorderEvent,
  ReorderableItemLayout,
  ReorderableListRenderItemInfo,
  ReorderableListSection,
  ReorderableSectionListRenderItemInfo,
} from './types';
import { flashSectionViewportBridge } from './flash-section-viewport';

type FlashOwnedProp =
  | 'CellRendererComponent'
  | 'data'
  | 'horizontal'
  | 'inverted'
  | 'keyExtractor'
  | 'maintainVisibleContentPosition'
  | 'masonry'
  | 'numColumns'
  | 'optimizeItemArrangement'
  | 'overrideProps'
  | 'renderItem'
  | 'renderScrollComponent';

const FLASH_RUNTIME_RESERVED_PROPS = [
  'CellRendererComponent',
  'horizontal',
  'inverted',
  'maintainVisibleContentPosition',
  'masonry',
  'numColumns',
  'optimizeItemArrangement',
  'overrideProps',
  'renderScrollComponent',
] as const;

function assertFlashReservedProps(
  name: string,
  props: Record<string, unknown>
): void {
  for (const prop of FLASH_RUNTIME_RESERVED_PROPS) {
    if (Object.prototype.hasOwnProperty.call(props, prop)) {
      throw new Error(
        `[react-native-reorderable] ${name} owns the correctness-critical ${prop} prop; remove it.`
      );
    }
  }
}

type PortableFlashListProps<Item> = Omit<
  FlashListProps<Item>,
  FlashOwnedProp
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
};

export type ReorderableFlashListProps<Item> = PortableFlashListProps<Item> &
  RefAttributes<FlashListRef<Item>>;

const flashListAdapter: ReorderableListViewportAdapter = {
  component: FlashList as never,
  displayName: 'ReorderableFlashList',
  reservedProps: [],
};

export function ReorderableFlashList<Item>(
  props: ReorderableFlashListProps<Item>
) {
  assertFlashReservedProps(
    'ReorderableFlashList',
    props as unknown as Record<string, unknown>
  );
  return ReorderableListRuntime(props as never, flashListAdapter);
}

type FlashSectionOwnedProp = FlashOwnedProp | 'sections';

type ReorderableFlashSectionListRef<Item> = Omit<FlashListRef<Item>, 'props'>;

const flashSectionAdapter: ReorderableSectionListViewportAdapter = {
  bridge: flashSectionViewportBridge,
  component: FlashList as never,
  displayName: 'ReorderableFlashSectionList',
};

export type ReorderableFlashSectionListProps<
  Item,
  Section extends ReorderableListSection<Item>,
> = Omit<FlashListProps<Item>, FlashSectionOwnedProp> & {
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
} & RefAttributes<ReorderableFlashSectionListRef<Item>>;

export function ReorderableFlashSectionList<
  Item,
  Section extends ReorderableListSection<Item>,
>(props: ReorderableFlashSectionListProps<Item, Section>) {
  assertFlashReservedProps(
    'ReorderableFlashSectionList',
    props as unknown as Record<string, unknown>
  );
  return ReorderableSectionListRuntime(props as never, flashSectionAdapter);
}
