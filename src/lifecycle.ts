export type InteractionTerminalOutcome = 'cancel' | 'commit';

/**
 * Serializes terminal outcomes for one engine interaction. Engines may race a
 * release with lifecycle cleanup, but exactly the first terminal input wins.
 */
export class InteractionLifecycle {
  private activeId: number | null = null;

  begin(interactionId: number): void {
    if (this.activeId == null || interactionId > this.activeId) {
      this.activeId = interactionId;
    }
  }

  finish(interactionId: number, _outcome: InteractionTerminalOutcome): boolean {
    if (this.activeId !== interactionId) return false;
    this.activeId = null;
    return true;
  }

  cancelActive(): boolean {
    if (this.activeId == null) return false;
    this.activeId = null;
    return true;
  }

  get active(): boolean {
    return this.activeId != null;
  }
}
