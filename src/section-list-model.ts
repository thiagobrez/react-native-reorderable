/* eslint-disable no-bitwise -- zero-length chrome updates the Fenwick count tree. */
import type {
  CollectionOrder,
  ReorderableItemLayout,
  ReorderableListSection,
} from './types';
import {
  applyGroupedExactMeasurement,
  createEstimatedGeometry,
  createGroupedExactGeometry,
  type ExactGeometry,
  type VirtualizedGeometry,
  contentLength,
  itemLength,
  itemOffset,
} from './virtualized-geometry';

export type SectionFrameKind =
  | 'footer'
  | 'header'
  | 'item'
  | 'itemSeparator'
  | 'contentGap'
  | 'contentPadding'
  | 'listEmpty'
  | 'listFooter'
  | 'listHeader'
  | 'sectionSeparator';

export type SectionFrame = Readonly<{
  identity: string;
  itemId: string | null;
  destinationBeforeId: string | null;
  kind: SectionFrameKind;
  sectionIndex: number;
}>;

export type SectionChromeConfig = Readonly<{
  generation?: number;
  hasItemSeparator?: boolean;
  hasListEmpty?: boolean;
  hasListFooter?: boolean;
  hasListHeader?: boolean;
  hasSectionSeparator?: boolean;
  contentPaddingBottom?: number;
  contentPaddingTop?: number;
  contentGap?: number;
}>;

export type SectionMeasurementQueue = {
  cursor: number;
  generations: number[];
  identities: string[];
  indices: number[];
  lengths: number[];
};

export function remapSectionMeasurementQueue(
  queue: SectionMeasurementQueue,
  frames: readonly SectionFrame[]
): SectionMeasurementQueue {
  'worklet';
  const frameByIdentity: Record<string, number> = {};
  frames.forEach((frame, index) => {
    frameByIdentity[`identity:${frame.identity}`] = index;
  });
  const remapped: SectionMeasurementQueue = {
    cursor: 0,
    generations: [],
    identities: [],
    indices: [],
    lengths: [],
  };
  for (
    let cursor = queue.cursor;
    cursor < queue.identities.length;
    cursor += 1
  ) {
    const identity = queue.identities[cursor]!;
    const nextIndex = frameByIdentity[`identity:${identity}`];
    if (nextIndex == null) continue;
    remapped.identities.push(identity);
    remapped.generations.push(queue.generations[cursor] ?? 0);
    remapped.indices.push(nextIndex);
    remapped.lengths.push(queue.lengths[cursor]!);
  }
  return remapped;
}

export type SectionModel<
  Item,
  Section extends ReorderableListSection<Item>,
> = Readonly<{
  chromePresentFlags: Uint8Array;
  frames: readonly SectionFrame[];
  geometry: VirtualizedGeometry;
  itemFrameById: Readonly<Record<string, number>>;
  emptyRuns: readonly EmptySectionRun[];
  emptyRunByFrameIndex: Int32Array;
  frameByIdentity: Readonly<Record<string, number>>;
  order: readonly CollectionOrder[];
  sectionIds: readonly string[];
  sections: readonly Section[];
  viewportFrameIndices: Int32Array;
}>;

export type EmptySectionRun = Readonly<{
  count: number;
  nextBeforeId: string | null;
  nextFrame: number;
  previousFrame: number;
  sectionStart: number;
}>;

export function createViewportSections<
  Item,
  Section extends ReorderableListSection<Item>,
>(
  sections: readonly Section[],
  keyExtractor: (item: Item, index: number, section: Section) => string
): (Section & {
  keyExtractor: (item: Item, index: number) => string;
})[] {
  return sections.map((section) => ({
    ...section,
    keyExtractor: (item: Item, index: number) =>
      keyExtractor(item, index, section),
  }));
}

function initialExactGeometry(
  exactItems: readonly (Omit<ReorderableItemLayout, 'index'> | null)[],
  estimate: number
): VirtualizedGeometry {
  return createGroupedExactGeometry(exactItems, estimate);
}

export function createSectionModel<
  Item,
  Section extends ReorderableListSection<Item>,
>(
  sections: readonly Section[],
  keyExtractor: (item: Item, index: number, section: Section) => string,
  getItemLayout:
    | ((
        sections: readonly Section[],
        sectionIndex: number,
        itemIndex: number
      ) => Omit<ReorderableItemLayout, 'index'>)
    | undefined,
  estimatedItemSize: number | undefined,
  hasHeader = true,
  hasFooter = true,
  chrome: SectionChromeConfig = {}
): SectionModel<Item, Section> {
  const frames: SectionFrame[] = [];
  const exactItemLayouts: (Omit<ReorderableItemLayout, 'index'> | null)[] = [];
  // Keys are prefixed with `identity:`, so even an item id such as
  // `__proto__` cannot address Object.prototype. Keep a plain prototype here
  // because Worklets serializes this record to the UI runtime.
  const itemFrameById: Record<string, number> = {};
  const itemViewportStartById: Record<string, number> = {};
  const order: CollectionOrder[] = [];
  const emptyRuns: EmptySectionRun[] = [];
  const sectionIds: string[] = [];
  const seenSections = new Set<string>();
  const seenItems = new Set<string>();
  let emptyRunStart = -1;
  let previousPopulatedFrame = -1;
  let previousItemEnd = 0;
  let contentCellCount = 0;

  const pushRawChrome = (
    identity: string,
    kind: Exclude<SectionFrameKind, 'item'>,
    sectionIndex: number,
    destinationBeforeId: string | null
  ) => {
    frames.push({
      destinationBeforeId,
      identity,
      itemId: null,
      kind,
      sectionIndex,
    });
    exactItemLayouts.push(null);
  };

  const pushChrome = (
    identity: string,
    kind: Exclude<SectionFrameKind, 'item'>,
    sectionIndex: number,
    destinationBeforeId: string | null
  ) => {
    const isViewportCell =
      kind !== 'contentPadding' &&
      kind !== 'itemSeparator' &&
      kind !== 'sectionSeparator';
    if (isViewportCell && contentCellCount > 0 && (chrome.contentGap ?? 0) > 0)
      pushRawChrome(
        `content:gap:${contentCellCount}`,
        'contentGap',
        sectionIndex,
        destinationBeforeId
      );
    pushRawChrome(identity, kind, sectionIndex, destinationBeforeId);
    if (isViewportCell) contentCellCount += 1;
  };

  if ((chrome.contentPaddingTop ?? 0) > 0)
    pushChrome('content:padding-top', 'contentPadding', 0, null);
  if (chrome.hasListHeader) pushChrome('list:header', 'listHeader', 0, null);

  sections.forEach((section, sectionIndex) => {
    if (typeof section.id !== 'string' || section.id.length === 0)
      throw new Error(
        '[react-native-reorderable] ReorderableSectionList section ids must be non-empty strings.'
      );
    if (seenSections.has(section.id))
      throw new Error(
        `[react-native-reorderable] Duplicate ReorderableSectionList section id "${section.id}".`
      );
    seenSections.add(section.id);
    sectionIds.push(section.id);
    pushChrome(`section:${section.id}:header`, 'header', sectionIndex, null);
    const collectionIds: string[] = [];
    section.data.forEach((item, itemIndex) => {
      const id = keyExtractor(item, itemIndex, section);
      if (typeof id !== 'string' || id.length === 0)
        throw new Error(
          '[react-native-reorderable] ReorderableSectionList keyExtractor must return a non-empty string.'
        );
      if (seenItems.has(id))
        throw new Error(
          `[react-native-reorderable] Duplicate ReorderableSectionList item id "${id}".`
        );
      seenItems.add(id);
      collectionIds.push(id);
      if (contentCellCount > 0 && (chrome.contentGap ?? 0) > 0) {
        pushRawChrome(
          `content:gap:${contentCellCount}`,
          'contentGap',
          sectionIndex,
          id
        );
      }
      const viewportStart = frames.length;
      if (chrome.hasSectionSeparator && itemIndex === 0) {
        pushRawChrome(
          `section:${section.id}:section-separator:leading`,
          'sectionSeparator',
          sectionIndex,
          id
        );
      }
      itemFrameById[`identity:${id}`] = frames.length;
      itemViewportStartById[`identity:${id}`] = viewportStart;
      if (emptyRunStart >= 0) {
        emptyRuns.push({
          count: sectionIndex - emptyRunStart,
          nextBeforeId: id,
          nextFrame: frames.length,
          previousFrame: previousPopulatedFrame,
          sectionStart: emptyRunStart,
        });
        emptyRunStart = -1;
      }
      frames.push({
        destinationBeforeId: id,
        identity: `item:${id}`,
        itemId: id,
        kind: 'item',
        sectionIndex,
      });
      previousPopulatedFrame = frames.length - 1;
      const layout = getItemLayout?.(sections, sectionIndex, itemIndex) ?? null;
      if (
        layout != null &&
        (!Number.isFinite(layout.offset) ||
          layout.offset < 0 ||
          !Number.isFinite(layout.length) ||
          layout.length <= 0 ||
          layout.offset < previousItemEnd)
      )
        throw new Error(
          `[react-native-reorderable] ReorderableSectionList getItemLayout must return positive lengths and absolute offsets from content start including every preceding section header and footer; invalid geometry for section ${sectionIndex}, item ${itemIndex}.`
        );
      exactItemLayouts.push(layout);
      contentCellCount += 1;
      if (layout != null) previousItemEnd = layout.offset + layout.length;
      if (itemIndex < section.data.length - 1) {
        const nextId = keyExtractor(
          section.data[itemIndex + 1]!,
          itemIndex + 1,
          section
        );
        const hasSectionItemSeparator =
          (section as Section & { ItemSeparatorComponent?: unknown })
            .ItemSeparatorComponent != null;
        if (chrome.hasItemSeparator || hasSectionItemSeparator)
          pushChrome(
            `section:${section.id}:item-separator:${id}`,
            'itemSeparator',
            sectionIndex,
            nextId
          );
      }
    });
    if (collectionIds.length === 0 && emptyRunStart < 0)
      emptyRunStart = sectionIndex;
    if (chrome.hasSectionSeparator && section.data.length > 0) {
      pushChrome(
        `section:${section.id}:section-separator:trailing`,
        'sectionSeparator',
        sectionIndex,
        null
      );
    }
    pushChrome(`section:${section.id}:footer`, 'footer', sectionIndex, null);
    order.push({ sectionId: section.id, itemIds: collectionIds });
  });
  if (emptyRunStart >= 0)
    emptyRuns.push({
      count: sections.length - emptyRunStart,
      nextBeforeId: null,
      nextFrame: -1,
      previousFrame: previousPopulatedFrame,
      sectionStart: emptyRunStart,
    });

  if (chrome.hasListEmpty && sections.length === 0)
    pushChrome('list:empty', 'listEmpty', -1, null);
  if (chrome.hasListFooter)
    pushChrome(
      'list:footer',
      'listFooter',
      Math.max(0, sections.length - 1),
      null
    );
  if ((chrome.contentPaddingBottom ?? 0) > 0)
    pushChrome(
      'content:padding-bottom',
      'contentPadding',
      Math.max(0, sections.length - 1),
      null
    );

  const estimate = estimatedItemSize ?? 64;
  const chromePresentFlags = new Uint8Array(frames.length);
  frames.forEach((frame, index) => {
    chromePresentFlags[index] =
      (frame.kind === 'header' && !hasHeader) ||
      (frame.kind === 'footer' && !hasFooter)
        ? 0
        : 1;
  });
  const frameByIdentity: Record<string, number> = {};
  frames.forEach((frame, index) => {
    frameByIdentity[`identity:${frame.identity}`] = index;
  });
  const emptyRunByFrameIndex = new Int32Array(frames.length + 1);
  emptyRunByFrameIndex.fill(-1);
  emptyRuns.forEach((run, runIndex) => {
    const start = run.previousFrame < 0 ? 0 : run.previousFrame + 1;
    const end = run.nextFrame < 0 ? frames.length : run.nextFrame;
    emptyRunByFrameIndex.fill(runIndex, start, end + 1);
  });
  let geometry: VirtualizedGeometry;
  if (getItemLayout == null) {
    geometry = createEstimatedGeometry(
      frames.length,
      estimate,
      estimatedItemSize == null
    );
    frames.forEach((frame, index) => {
      const absent =
        (frame.kind === 'header' && !hasHeader) ||
        (frame.kind === 'footer' && !hasFooter);
      if (!absent || geometry.exact) return;
      geometry.measuredFlags[index] = 1;
      geometry.measuredSizes[index] = 0;
      for (
        let treeIndex = index + 1;
        treeIndex <= geometry.count;
        treeIndex += treeIndex & -treeIndex
      ) {
        const treeArrayIndex = treeIndex - 1;
        geometry.measuredCounts[treeArrayIndex] =
          geometry.measuredCounts[treeArrayIndex]! + 1;
      }
    });
  } else {
    geometry = initialExactGeometry(exactItemLayouts, estimate);
    frames.forEach((frame, index) => {
      const absent =
        (frame.kind === 'header' && !hasHeader) ||
        (frame.kind === 'footer' && !hasFooter);
      if (absent && geometry.exact)
        applyExactChromeMeasurement(geometry, index, 0);
    });
  }
  frames.forEach((frame, index) => {
    const length =
      frame.identity === 'content:padding-top'
        ? chrome.contentPaddingTop
        : frame.identity === 'content:padding-bottom'
          ? chrome.contentPaddingBottom
          : frame.kind === 'contentGap'
            ? chrome.contentGap
            : undefined;
    if (length == null) return;
    if (geometry.exact) applyExactChromeMeasurement(geometry, index, length);
    else {
      geometry.measuredFlags[index] = 1;
      geometry.measuredSizes[index] = length;
      geometry.measuredCount += 1;
      geometry.measuredSum += length;
      for (
        let treeIndex = index;
        treeIndex < geometry.count;
        treeIndex |= treeIndex + 1
      ) {
        geometry.measuredCounts[treeIndex] =
          geometry.measuredCounts[treeIndex]! + 1;
        geometry.measuredSums[treeIndex] =
          geometry.measuredSums[treeIndex]! + length;
      }
    }
  });
  return {
    chromePresentFlags,
    emptyRunByFrameIndex,
    emptyRuns,
    frameByIdentity,
    frames,
    geometry,
    itemFrameById,
    order,
    sectionIds,
    sections,
    viewportFrameIndices: Int32Array.from(
      frames.flatMap((frame, index) =>
        frame.kind === 'header' || frame.kind === 'footer'
          ? [index]
          : frame.kind === 'item'
            ? [itemViewportStartById[`identity:${frame.itemId}`] ?? index]
            : []
      )
    ),
  };
}

export function applyExactChromeMeasurement(
  geometry: ExactGeometry,
  frameIndex: number,
  length: number
): ExactGeometry {
  'worklet';
  if (geometry.grouped)
    applyGroupedExactMeasurement(geometry, frameIndex, length);
  return geometry;
}

export function destinationAtSectionFrame(
  frames: readonly SectionFrame[],
  sectionIds: readonly string[],
  itemIdsBySection: readonly (readonly string[])[],
  frameIndex: number
): { sectionId: string; beforeId: string | null } | null {
  'worklet';
  if (sectionIds.length === 0) return null;
  if (frameIndex >= frames.length)
    return { sectionId: sectionIds[sectionIds.length - 1]!, beforeId: null };
  const frame = frames[Math.max(0, frameIndex)];
  if (frame == null) return null;
  const sectionId = sectionIds[frame.sectionIndex];
  if (sectionId == null)
    return frame.kind === 'listFooter' && sectionIds.length > 0
      ? { sectionId: sectionIds[sectionIds.length - 1]!, beforeId: null }
      : null;
  if (frame.kind === 'item') return { sectionId, beforeId: frame.itemId };
  if (frame.kind === 'contentPadding' || frame.kind === 'listHeader')
    return {
      sectionId: sectionIds[0]!,
      beforeId: itemIdsBySection[0]?.[0] ?? null,
    };
  if (frame.kind === 'header')
    return {
      sectionId,
      beforeId: itemIdsBySection[frame.sectionIndex]?.[0] ?? null,
    };
  return { sectionId, beforeId: frame.destinationBeforeId };
}

export function emptySectionDestinationAtOffset(
  geometry: VirtualizedGeometry,
  emptyRuns: readonly EmptySectionRun[],
  emptyRunByFrameIndex: Int32Array,
  sectionIds: readonly string[],
  frameIndex: number,
  offset: number,
  viewportLength: number
): {
  sectionId: string;
  beforeId: string | null;
  feedbackOffset: number;
} | null {
  'worklet';
  if (sectionIds.length === 0 || emptyRuns.length === 0) return null;
  const allEmpty =
    emptyRuns.length === 1 && emptyRuns[0]?.count === sectionIds.length;
  if (allEmpty) {
    const length = Math.max(viewportLength, contentLength(geometry), 1);
    const slot = Math.max(
      0,
      Math.min(
        sectionIds.length - 1,
        Math.floor((offset / length) * sectionIds.length)
      )
    );
    return {
      beforeId: null,
      feedbackOffset: ((slot + 0.5) / sectionIds.length) * length,
      sectionId: sectionIds[slot]!,
    };
  }
  const runIndex = emptyRunByFrameIndex[frameIndex] ?? -1;
  if (runIndex >= 0) {
    const run = emptyRuns[runIndex]!;
    const start =
      run.previousFrame < 0
        ? 0
        : itemOffset(geometry, run.previousFrame) +
          itemLength(geometry, run.previousFrame) / 2;
    const end =
      run.nextFrame < 0
        ? Math.max(contentLength(geometry), viewportLength)
        : itemOffset(geometry, run.nextFrame) +
          itemLength(geometry, run.nextFrame) / 2;
    if (offset >= start && offset < end) {
      const width = Math.max(1, end - start);
      const hasPrevious = run.previousFrame >= 0;
      const hasNext = run.nextFrame >= 0;
      const destinationCount =
        run.count + (hasPrevious ? 1 : 0) + (hasNext ? 1 : 0);
      const slot = Math.min(
        destinationCount - 1,
        Math.floor(((offset - start) / width) * destinationCount)
      );
      const emptySlot = slot - (hasPrevious ? 1 : 0);
      const sectionIndex =
        hasPrevious && slot === 0
          ? run.sectionStart - 1
          : emptySlot < run.count
            ? run.sectionStart + emptySlot
            : run.sectionStart + run.count;
      return {
        beforeId:
          hasNext && slot === destinationCount - 1 ? run.nextBeforeId : null,
        feedbackOffset: start + ((slot + 0.5) / destinationCount) * width,
        sectionId: sectionIds[sectionIndex]!,
      };
    }
  }
  return null;
}
