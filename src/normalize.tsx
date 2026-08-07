import {
  Children,
  Fragment,
  isValidElement,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { type ViewProps } from 'react-native';

import ReorderableContentView from './ReorderableContentView';
import type {
  CollectionOrder,
  DraggableItemProps,
  DropEvent,
  DropZoneProps,
  ReorderableItemProps,
  ReorderableSectionProps,
} from './types';

export type EntryKind = 'item' | 'section' | 'header' | 'footer' | 'dropZone';

export type NormalizedChildren = Readonly<{
  children: ReactElement[];
  collectionIds: string[];
  entryIds: string[];
  entryKinds: EntryKind[];
  order: CollectionOrder[];
}>;

export type NativeEntries = Readonly<{
  children: ReactElement[];
  collectionIds: string[];
  entryIds: string[];
  entryKinds: EntryKind[];
  orderedEntryIds: string[];
}>;

type ReorderableMarkerTypes = Readonly<{
  Item: ComponentType<ReorderableItemProps>;
  Section: ComponentType<ReorderableSectionProps>;
}>;

type DragMarkerTypes = Readonly<{
  DropZone: ComponentType<DropZoneProps>;
  Item: ComponentType<DraggableItemProps>;
}>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[react-native-reorderable] ${message}`);
  }
}

function validateId(id: string, kind: string): void {
  invariant(
    typeof id === 'string' && id.length > 0,
    `${kind} id must be a non-empty string.`
  );
}

function isElementOfType<Props>(
  node: ReactNode,
  type: ComponentType<Props>
): node is ReactElement<Props> {
  return isValidElement(node) && node.type === type;
}

function flattenChildren(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((node) => {
    if (
      isValidElement<{ children?: ReactNode }>(node) &&
      node.type === Fragment
    ) {
      return flattenChildren(node.props.children);
    }
    return [node];
  });
}

function itemView(
  key: string,
  props: ReorderableItemProps | DraggableItemProps | DropZoneProps
): ReactElement {
  const viewProps = { ...props } as ViewProps & {
    children?: ReactNode;
    id?: string;
  };
  const { children } = props;
  delete viewProps.children;
  delete viewProps.id;
  return (
    <ReorderableContentView
      {...viewProps}
      collapsable={false}
      entryIdentifier={key}
      id={key}
      key={key}
    >
      {children}
    </ReorderableContentView>
  );
}

function appendEntry(
  normalized: {
    children: ReactElement[];
    collectionIds: string[];
    entryIds: string[];
    entryKinds: EntryKind[];
  },
  entry: {
    child: ReactElement;
    collectionId: string;
    id: string;
    kind: EntryKind;
  }
): void {
  normalized.children.push(entry.child);
  normalized.collectionIds.push(entry.collectionId);
  normalized.entryIds.push(entry.id);
  normalized.entryKinds.push(entry.kind);
}

export function nativeLayoutIdentifier(
  kind: EntryKind,
  id: string,
  collectionId: string
): string {
  switch (kind) {
    case 'section':
      return `section:${id}`;
    case 'header':
      return `header:${collectionId}`;
    case 'footer':
      return `footer:${collectionId}`;
    case 'dropZone':
      return `drop:${id}`;
    case 'item':
      return `item:${id}`;
  }
}

export function parseNativeIds(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) &&
      value.every((id): id is string => typeof id === 'string')
      ? value
      : [];
  } catch {
    return [];
  }
}

export function mapNativeDropEvent(
  itemIdsJson: string,
  destinationId: string
): DropEvent {
  return {
    itemIds: parseNativeIds(itemIdsJson),
    destinationId,
  };
}

export function prepareNativeEntries(
  normalized: Omit<NormalizedChildren, 'order'>
): NativeEntries {
  const orderedEntryIds = normalized.entryKinds.map((kind, index) =>
    nativeLayoutIdentifier(
      kind,
      normalized.entryIds[index] ?? '',
      normalized.collectionIds[index] ?? ''
    )
  );
  const indices = orderedEntryIds
    .map((_identifier, index) => index)
    .sort((left, right) => {
      const leftIdentifier = orderedEntryIds[left] ?? '';
      const rightIdentifier = orderedEntryIds[right] ?? '';
      return leftIdentifier < rightIdentifier
        ? -1
        : leftIdentifier > rightIdentifier
          ? 1
          : 0;
    });

  return {
    children: indices.map((index) => normalized.children[index]!),
    collectionIds: indices.map((index) => normalized.collectionIds[index]!),
    entryIds: indices.map((index) => normalized.entryIds[index]!),
    entryKinds: indices.map((index) => normalized.entryKinds[index]!),
    orderedEntryIds,
  };
}

export function normalizeReorderableChildren(
  children: ReactNode,
  markers: ReorderableMarkerTypes
): NormalizedChildren {
  const nodes = flattenChildren(children);
  const normalized = {
    children: [] as ReactElement[],
    collectionIds: [] as string[],
    entryIds: [] as string[],
    entryKinds: [] as EntryKind[],
  };
  const seenIds = new Set<string>();
  const directItems = nodes.filter((node) =>
    isElementOfType(node, markers.Item)
  );
  const sections = nodes.filter((node) =>
    isElementOfType(node, markers.Section)
  );

  invariant(
    directItems.length === nodes.length || sections.length === nodes.length,
    'ReorderableContainer children must be all ReorderableItem elements or all ReorderableSection elements.'
  );

  if (directItems.length === nodes.length) {
    const itemIds: string[] = [];
    for (const node of directItems) {
      const { id } = node.props;
      validateId(id, 'ReorderableItem');
      invariant(!seenIds.has(id), `Duplicate item id "${id}".`);
      seenIds.add(id);
      itemIds.push(id);
      appendEntry(normalized, {
        child: itemView(`item:${id}`, node.props),
        collectionId: '',
        id,
        kind: 'item',
      });
    }

    return {
      ...normalized,
      order: [{ sectionId: null, itemIds }],
    };
  }

  const order: CollectionOrder[] = [];
  const seenSectionIds = new Set<string>();
  for (const section of sections) {
    const {
      children: sectionChildren,
      footer,
      header,
      id,
      ...sectionViewProps
    } = section.props;
    validateId(id, 'ReorderableSection');
    invariant(!seenSectionIds.has(id), `Duplicate section id "${id}".`);
    seenSectionIds.add(id);

    appendEntry(normalized, {
      child: (
        <ReorderableContentView
          {...sectionViewProps}
          accessible={false}
          collapsable={false}
          entryIdentifier={`section:${id}`}
          id={`section:${id}`}
          key={`section:${id}`}
          pointerEvents="none"
        />
      ),
      collectionId: id,
      id,
      kind: 'section',
    });

    if (header != null) {
      appendEntry(normalized, {
        child: (
          <ReorderableContentView
            collapsable={false}
            entryIdentifier={`header:${id}`}
            id={`header:${id}`}
            key={`header:${id}`}
          >
            {header}
          </ReorderableContentView>
        ),
        collectionId: id,
        id,
        kind: 'header',
      });
    }

    const itemIds: string[] = [];
    for (const item of flattenChildren(sectionChildren)) {
      invariant(
        isElementOfType(item, markers.Item),
        `ReorderableSection "${id}" may only contain ReorderableItem elements.`
      );
      validateId(item.props.id, 'ReorderableItem');
      invariant(
        !seenIds.has(item.props.id),
        `Duplicate item id "${item.props.id}".`
      );
      seenIds.add(item.props.id);
      itemIds.push(item.props.id);
      appendEntry(normalized, {
        child: itemView(`item:${item.props.id}`, item.props),
        collectionId: id,
        id: item.props.id,
        kind: 'item',
      });
    }
    if (footer != null) {
      appendEntry(normalized, {
        child: (
          <ReorderableContentView
            collapsable={false}
            entryIdentifier={`footer:${id}`}
            id={`footer:${id}`}
            key={`footer:${id}`}
          >
            {footer}
          </ReorderableContentView>
        ),
        collectionId: id,
        id,
        kind: 'footer',
      });
    }
    order.push({ sectionId: id, itemIds });
  }

  return { ...normalized, order };
}

export function normalizeDragChildren(
  children: ReactNode,
  markers: DragMarkerTypes
): Omit<NormalizedChildren, 'order'> {
  const normalized = {
    children: [] as ReactElement[],
    collectionIds: [] as string[],
    entryIds: [] as string[],
    entryKinds: [] as EntryKind[],
  };
  const seenIds = new Set<string>();

  for (const node of flattenChildren(children)) {
    const isItem = isElementOfType(node, markers.Item);
    const isDropZone = isElementOfType(node, markers.DropZone);
    invariant(
      isItem || isDropZone,
      'DragContainer children must be DraggableItem or DropZone elements.'
    );

    const { id } = node.props;
    validateId(id, isItem ? 'DraggableItem' : 'DropZone');
    invariant(!seenIds.has(id), `Duplicate drag container id "${id}".`);
    seenIds.add(id);
    appendEntry(normalized, {
      child: itemView(`${isItem ? 'item' : 'drop'}:${id}`, node.props),
      collectionId: '',
      id,
      kind: isItem ? 'item' : 'dropZone',
    });
  }

  return normalized;
}

export function fallbackSectionViewProps(
  props: ReorderableSectionProps
): ViewProps {
  const viewProps = { ...props } as ViewProps & {
    children?: ReactNode;
    footer?: ReactNode;
    header?: ReactNode;
    id?: string;
  };
  delete viewProps.children;
  delete viewProps.footer;
  delete viewProps.header;
  delete viewProps.id;
  return viewProps;
}
