import type { AccessibilityStrings, CollectionOrder } from './types';

export const defaultAccessibilityStrings: AccessibilityStrings = {
  moveEarlierAction: 'Move earlier',
  moveLaterAction: 'Move later',
  dropSelectedItemsAction: 'Drop selected items here',
  unavailableAnnouncement: 'This action is no longer available.',
  orderCorrectedAnnouncement: 'Order updated.',
  reorderAnnouncement: ({ event, position, collectionSize }) =>
    event.sourceIds.length === 1
      ? `Moved item to position ${position} of ${collectionSize}.`
      : `Moved ${event.sourceIds.length} items to position ${position} of ${collectionSize}.`,
  dropAnnouncement: ({ event }) =>
    event.itemIds.length === 1
      ? 'Dropped item.'
      : `Dropped ${event.itemIds.length} items.`,
};

export function resolveAccessibilityStrings(
  overrides: Partial<AccessibilityStrings> | undefined
): AccessibilityStrings {
  return { ...defaultAccessibilityStrings, ...overrides };
}

export function collectionOrderSignature(
  order: readonly CollectionOrder[]
): string {
  return JSON.stringify(order);
}
