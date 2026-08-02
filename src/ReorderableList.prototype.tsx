/**
 * PROTOTYPE ONLY — issue #9.
 *
 * This file sketches the public list seam. It is intentionally not exported and
 * contains no implementation. Delete it after the v1 interface is decided.
 */
import type { ComponentType, ReactElement, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { ReorderMove } from './types';

declare const reorderableListAdapter: unique symbol;

/**
 * Opaque, library-certified viewport adapter. The implementation interface is
 * private so callers cannot accidentally weaken the portable contract.
 */
export type ReorderableListAdapter = Readonly<{
  [reorderableListAdapter]: true;
}>;

export type ReorderableListRenderItemInfo<Item> = Readonly<{
  index: number;
  item: Item;
}>;

export type ReorderableSectionListRenderItemInfo<Item, Section> = Readonly<{
  index: number;
  item: Item;
  section: Section;
}>;

type Layout = Readonly<{
  index: number;
  length: number;
  offset: number;
}>;

type SharedListProps = Readonly<{
  /** Application order remains authoritative after a reorder commit. */
  onMove: (move: ReorderMove) => void;
  /** Defaults to the built-in React Native FlatList adapter. */
  adapter?: ReorderableListAdapter;
  enabled?: boolean;
  engine?: 'auto' | 'fallback';
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  ListHeaderComponent?: ReactNode;
  ListFooterComponent?: ReactNode;
  ListEmptyComponent?: ReactNode;
  ItemSeparatorComponent?: ComponentType | null;
}>;

export type ReorderableListProps<Item> = SharedListProps &
  Readonly<{
    data: readonly Item[];
    keyExtractor: (item: Item, index: number) => string;
    renderItem: (
      info: ReorderableListRenderItemInfo<Item>
    ) => ReactElement | null;

    /** Optional optimization; variable-height rows remain supported without it. */
    getItemLayout?: (data: readonly Item[], index: number) => Layout;
    estimatedItemSize?: number;
  }>;

export type ReorderableListSection<Item> = Readonly<{
  /** Stable collection identity. */
  id: string;
  data: readonly Item[];
}>;

export type ReorderableSectionListProps<
  Item,
  Section extends ReorderableListSection<Item>,
> = SharedListProps &
  Readonly<{
    sections: readonly Section[];
    keyExtractor: (item: Item, index: number, section: Section) => string;
    renderItem: (
      info: ReorderableSectionListRenderItemInfo<Item, Section>
    ) => ReactElement | null;
    renderSectionHeader?: (info: { section: Section }) => ReactElement | null;
    renderSectionFooter?: (info: { section: Section }) => ReactElement | null;
    SectionSeparatorComponent?: ComponentType | null;

    /** Optional optimization; variable-height rows remain supported without it. */
    getItemLayout?: (
      sections: readonly Section[],
      sectionIndex: number,
      itemIndex: number
    ) => Omit<Layout, 'index'>;
    estimatedItemSize?: number;
  }>;

export declare function ReorderableList<Item>(
  props: ReorderableListProps<Item>
): ReactElement;

export declare function ReorderableSectionList<
  Item,
  Section extends ReorderableListSection<Item>,
>(props: ReorderableSectionListProps<Item, Section>): ReactElement;
