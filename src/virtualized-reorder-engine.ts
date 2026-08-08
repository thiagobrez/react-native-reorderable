import type { ReorderableItemLayout, ReorderDestination } from './types';

type Commit = Readonly<{
  sourceIds: readonly string[];
  destination: ReorderDestination;
}>;

type ActiveInteraction = {
  destination: ReorderDestination | null;
  pointerViewportY: number;
  sourceIds: readonly string[];
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

/**
 * Identity and exact-geometry coordinator for one library-owned list viewport.
 * The viewport adapter owns clocks and scrolling; this class owns no React or
 * native implementation detail, which keeps terminal semantics deterministic.
 */
export class VirtualizedReorderEngine {
  private active: ActiveInteraction | null = null;
  private itemIds: readonly string[];
  private layouts: readonly ReorderableItemLayout[];
  private readonly onCommit: (commit: Commit) => void;
  private scrollOffset = 0;
  private viewportHeight = 0;

  constructor({
    itemIds,
    layouts,
    onCommit,
  }: Readonly<{
    itemIds: readonly string[];
    layouts: readonly ReorderableItemLayout[];
    onCommit: (commit: Commit) => void;
  }>) {
    this.itemIds = itemIds;
    this.layouts = layouts;
    this.onCommit = onCommit;
  }

  updateGeometry(
    itemIds: readonly string[],
    layouts: readonly ReorderableItemLayout[]
  ): void {
    this.itemIds = itemIds;
    this.layouts = layouts;
    if (
      this.active != null &&
      this.active.sourceIds.some((id) => !itemIds.includes(id))
    ) {
      this.cancel();
      return;
    }
    this.refreshDestination();
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
    const activatedLayout = this.layouts[activatedIndex];
    if (activatedIndex < 0 || activatedLayout == null || this.active != null) {
      return false;
    }
    const selected = new Set(selectedIds);
    const sourceIds = selected.has(activatedId)
      ? this.itemIds.filter((id) => selected.has(id))
      : [activatedId];
    const sourceViewportCenter =
      activatedLayout.offset + activatedLayout.length / 2 - this.scrollOffset;
    this.active = {
      destination: null,
      pointerViewportY: sourceViewportCenter,
      sourceIds,
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
    if (!withinViewport || active.destination == null) return;
    if (
      active.sourceIds.some((id) => !this.itemIds.includes(id)) ||
      (active.destination.beforeId != null &&
        !this.itemIds.includes(active.destination.beforeId))
    ) {
      return;
    }
    this.onCommit({
      sourceIds: active.sourceIds,
      destination: active.destination,
    });
  }

  cancel(): void {
    this.active = null;
  }

  snapshot(): VirtualizedReorderSnapshot {
    const feedbackViewportY = this.feedbackViewportY();
    return {
      active: this.active != null,
      autoScrollVelocity: this.autoScrollVelocity(),
      destination: this.active?.destination ?? null,
      feedbackViewportY,
      scrollOffset: this.scrollOffset,
      sourceIds: this.active?.sourceIds ?? [],
    };
  }

  private contentLength(): number {
    const lastLayout = this.layouts[this.layouts.length - 1];
    return lastLayout == null ? 0 : lastLayout.offset + lastLayout.length;
  }

  private clampScrollOffset(offset: number): number {
    return Math.max(
      0,
      Math.min(offset, Math.max(0, this.contentLength() - this.viewportHeight))
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
      this.contentLength() - this.viewportHeight
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
    const sourceIds = new Set(active.sourceIds);
    const contentY =
      this.scrollOffset +
      Math.max(0, Math.min(this.viewportHeight, active.pointerViewportY));
    let beforeId: string | null = null;
    for (let index = 0; index < this.itemIds.length; index += 1) {
      const id = this.itemIds[index];
      const layout = this.layouts[index];
      if (id == null || layout == null || sourceIds.has(id)) continue;
      if (contentY < layout.offset + layout.length / 2) {
        beforeId = id;
        break;
      }
    }
    active.destination = { sectionId: null, beforeId };
  }

  private feedbackViewportY(): number | null {
    const destination = this.active?.destination;
    if (destination == null || this.viewportHeight <= 0) return null;
    const destinationIndex =
      destination.beforeId == null
        ? this.layouts.length
        : this.itemIds.indexOf(destination.beforeId);
    const contentY =
      destinationIndex >= this.layouts.length
        ? this.contentLength()
        : (this.layouts[destinationIndex]?.offset ?? 0);
    return Math.max(
      0,
      Math.min(this.viewportHeight, contentY - this.scrollOffset)
    );
  }
}
