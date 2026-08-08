import type { ReorderableItemLayout, ReorderDestination } from './types';
import {
  applyMeasurement,
  contentLength,
  createEstimatedGeometry,
  createExactGeometry,
  indexAtOffset,
  itemLength,
  itemOffset,
  type GeometryCorrection,
  type VirtualizedGeometry,
} from './virtualized-geometry';

type Commit = Readonly<{
  sourceIds: readonly string[];
  destination: ReorderDestination;
}>;

type ActiveInteraction = {
  activatedId: string;
  destination: ReorderDestination | null;
  pointerViewportY: number;
  sourceIds: readonly string[];
  sourceIndex: number;
  sourceViewportCenter: number;
};

export type VirtualizedReorderSnapshot = Readonly<{
  active: boolean;
  autoScrollVelocity: number;
  destination: ReorderDestination | null;
  feedbackViewportY: number | null;
  scrollOffset: number;
  sourceIds: readonly string[];
}>;

const EDGE_SIZE = 60;
const MAX_AUTO_SCROLL_VELOCITY = 360;

/** Deterministic semantic/geometry seam mirroring the UI-runtime coordinator. */
export class VirtualizedReorderEngine {
  private active: ActiveInteraction | null = null;
  private geometry: VirtualizedGeometry;
  private itemIds: readonly string[];
  private readonly onCommit: (commit: Commit) => void;
  private readonly onTerminal: ((commit: Commit | null) => void) | undefined;
  private scrollOffset = 0;
  private viewportHeight = 0;

  constructor({
    itemIds,
    layouts,
    estimatedItemSize = 64,
    adaptive = false,
    onCommit,
    onTerminal,
  }: Readonly<{
    itemIds: readonly string[];
    layouts?: readonly ReorderableItemLayout[];
    estimatedItemSize?: number;
    adaptive?: boolean;
    onCommit: (commit: Commit) => void;
    onTerminal?: (commit: Commit | null) => void;
  }>) {
    this.itemIds = itemIds;
    this.geometry = layouts
      ? createExactGeometry(layouts)
      : createEstimatedGeometry(itemIds.length, estimatedItemSize, adaptive);
    this.onCommit = onCommit;
    this.onTerminal = onTerminal;
  }

  updateGeometry(
    itemIds: readonly string[],
    layouts?: readonly ReorderableItemLayout[]
  ): void {
    const active = this.active;
    const orderChanged =
      itemIds.length !== this.itemIds.length ||
      this.itemIds.some((id, index) => id !== itemIds[index]);
    this.itemIds = itemIds;
    if (layouts != null) this.geometry = createExactGeometry(layouts);
    else if (orderChanged) {
      const estimate = this.geometry.exact ? 64 : this.geometry.estimate;
      const adaptive = this.geometry.exact ? false : this.geometry.adaptive;
      this.geometry = createEstimatedGeometry(
        itemIds.length,
        estimate,
        adaptive
      );
    }
    if (active != null && orderChanged) {
      const nextSourceIndex = itemIds.indexOf(active.activatedId);
      if (
        nextSourceIndex < 0 ||
        active.sourceIds.some((id) => !itemIds.includes(id))
      ) {
        this.cancel();
        return;
      }
      active.sourceIndex = nextSourceIndex;
      active.sourceViewportCenter =
        itemOffset(this.geometry, nextSourceIndex) +
        itemLength(this.geometry, nextSourceIndex) / 2 -
        this.scrollOffset;
    }
    this.refreshDestination();
  }

  measure(index: number, length: number): GeometryCorrection {
    const correction = applyMeasurement(
      this.geometry,
      index,
      length,
      this.active?.sourceIndex
    );
    if (this.active != null && correction.anchorDelta !== 0) {
      this.active.sourceViewportCenter += correction.anchorDelta;
      this.active.pointerViewportY += correction.anchorDelta;
    }
    this.refreshDestination();
    return correction;
  }

  setViewport(height: number, scrollOffset: number): void {
    this.viewportHeight = Math.max(0, height);
    this.scrollOffset = this.clampScrollOffset(scrollOffset);
    this.refreshDestination();
  }

  setScrollOffset(scrollOffset: number): void {
    this.scrollOffset = this.clampScrollOffset(scrollOffset);
    this.refreshDestination();
  }

  start(activatedId: string, selectedIds: readonly string[]): boolean {
    const activatedIndex = this.itemIds.indexOf(activatedId);
    if (activatedIndex < 0 || this.active != null) return false;
    const selected = new Set(selectedIds);
    const sourceIds = selected.has(activatedId)
      ? this.itemIds.filter((id) => selected.has(id))
      : [activatedId];
    const sourceViewportCenter =
      itemOffset(this.geometry, activatedIndex) +
      itemLength(this.geometry, activatedIndex) / 2 -
      this.scrollOffset;
    this.active = {
      activatedId,
      destination: null,
      pointerViewportY: sourceViewportCenter,
      sourceIds,
      sourceIndex: activatedIndex,
      sourceViewportCenter,
    };
    this.refreshDestination();
    return true;
  }

  move(translationY: number): void {
    if (this.active == null) return;
    this.active.pointerViewportY =
      this.active.sourceViewportCenter + translationY;
    this.refreshDestination();
  }

  autoScrollTick(elapsedMs: number): boolean {
    const velocity = this.autoScrollVelocity();
    if (this.active == null || velocity === 0 || elapsedMs <= 0) return false;
    const previousOffset = this.scrollOffset;
    this.scrollOffset = this.clampScrollOffset(
      previousOffset + velocity * (elapsedMs / 1000)
    );
    this.refreshDestination();
    return this.scrollOffset !== previousOffset;
  }

  finish(withinViewport: boolean): void {
    const active = this.active;
    if (active == null) return;
    this.active = null;
    let commit: Commit | null = null;
    if (
      withinViewport &&
      active.destination != null &&
      !active.sourceIds.some((id) => !this.itemIds.includes(id)) &&
      (active.destination.beforeId == null ||
        this.itemIds.includes(active.destination.beforeId))
    ) {
      commit = {
        sourceIds: active.sourceIds,
        destination: active.destination,
      };
    }
    this.onTerminal?.(commit);
    if (commit != null) this.onCommit(commit);
  }

  cancel(): void {
    if (this.active == null) return;
    this.active = null;
    this.onTerminal?.(null);
  }

  snapshot(): VirtualizedReorderSnapshot {
    return {
      active: this.active != null,
      autoScrollVelocity: this.autoScrollVelocity(),
      destination: this.active?.destination ?? null,
      feedbackViewportY: this.feedbackViewportY(),
      scrollOffset: this.scrollOffset,
      sourceIds: this.active?.sourceIds ?? [],
    };
  }

  private clampScrollOffset(offset: number): number {
    return Math.max(
      0,
      Math.min(
        offset,
        Math.max(0, contentLength(this.geometry) - this.viewportHeight)
      )
    );
  }

  private autoScrollVelocity(): number {
    if (this.active == null || this.viewportHeight <= 0) return 0;
    const pointer = this.active.pointerViewportY;
    if (pointer < EDGE_SIZE && this.scrollOffset > 0) {
      return (
        -MAX_AUTO_SCROLL_VELOCITY *
        Math.min(1, Math.max(0, (EDGE_SIZE - pointer) / EDGE_SIZE))
      );
    }
    const maximumOffset = Math.max(
      0,
      contentLength(this.geometry) - this.viewportHeight
    );
    if (
      pointer > this.viewportHeight - EDGE_SIZE &&
      this.scrollOffset < maximumOffset
    ) {
      return (
        MAX_AUTO_SCROLL_VELOCITY *
        Math.min(
          1,
          Math.max(0, (pointer - (this.viewportHeight - EDGE_SIZE)) / EDGE_SIZE)
        )
      );
    }
    return 0;
  }

  private refreshDestination(): void {
    const active = this.active;
    if (active == null || this.viewportHeight <= 0) return;
    const contentY =
      this.scrollOffset +
      Math.max(0, Math.min(this.viewportHeight, active.pointerViewportY));
    let destinationIndex = indexAtOffset(this.geometry, contentY, true).index;
    const sourceIds = new Set(active.sourceIds);
    while (
      destinationIndex < this.itemIds.length &&
      sourceIds.has(this.itemIds[destinationIndex]!)
    ) {
      destinationIndex += 1;
    }
    active.destination = {
      sectionId: null,
      beforeId: this.itemIds[destinationIndex] ?? null,
    };
  }

  private feedbackViewportY(): number | null {
    const destination = this.active?.destination;
    if (destination == null || this.viewportHeight <= 0) return null;
    const destinationIndex =
      destination.beforeId == null
        ? this.itemIds.length
        : this.itemIds.indexOf(destination.beforeId);
    return Math.max(
      0,
      Math.min(
        this.viewportHeight,
        itemOffset(this.geometry, destinationIndex) - this.scrollOffset
      )
    );
  }
}
