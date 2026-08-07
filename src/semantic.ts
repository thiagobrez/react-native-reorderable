import type {
  CollectionOrder,
  DropEvent,
  ReorderDestination,
  ReorderEvent,
} from './types';

export function reconcileDrop(
  knownItemIds: readonly string[],
  sourceIds: readonly string[],
  knownDestinationIds: readonly string[],
  destinationId: string,
  accepted: boolean
): DropEvent | null {
  const knownItems = new Set(knownItemIds);
  const requested = new Set(sourceIds);
  if (
    !accepted ||
    sourceIds.length === 0 ||
    sourceIds.some(
      (id) => typeof id !== 'string' || id.length === 0 || !knownItems.has(id)
    ) ||
    !knownDestinationIds.includes(destinationId)
  ) {
    return null;
  }
  return {
    itemIds: knownItemIds.filter((id) => requested.has(id)),
    destinationId,
  };
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[react-native-reorderable] ${message}`);
  }
}

function validateCurrentOrder(order: readonly CollectionOrder[]): void {
  const sectionIds = new Set<string>();
  const itemIds = new Set<string>();

  for (const collection of order) {
    if (collection.sectionId != null) {
      invariant(
        collection.sectionId.length > 0,
        'Section identity must be a non-empty string.'
      );
      invariant(
        !sectionIds.has(collection.sectionId),
        `Duplicate section identity "${collection.sectionId}".`
      );
      sectionIds.add(collection.sectionId);
    }

    for (const itemId of collection.itemIds) {
      invariant(
        typeof itemId === 'string' && itemId.length > 0,
        'Item identity must be a non-empty string.'
      );
      invariant(!itemIds.has(itemId), `Duplicate item identity "${itemId}".`);
      itemIds.add(itemId);
    }
  }
}

function ordersEqual(
  left: readonly CollectionOrder[],
  right: readonly CollectionOrder[]
): boolean {
  return (
    left.length === right.length &&
    left.every((collection, collectionIndex) => {
      const other = right[collectionIndex];
      return (
        other != null &&
        collection.sectionId === other.sectionId &&
        collection.itemIds.length === other.itemIds.length &&
        collection.itemIds.every(
          (id, itemIndex) => id === other.itemIds[itemIndex]
        )
      );
    })
  );
}

/** Resolves the atomic move set at activation from application-owned selection. */
export function canonicalMoveSet(
  currentOrder: readonly CollectionOrder[],
  activatedId: string,
  selectedIds: readonly string[]
): string[] {
  validateCurrentOrder(currentOrder);
  const currentItemIds = currentOrder.flatMap(
    (collection) => collection.itemIds
  );
  if (!currentItemIds.includes(activatedId)) return [];

  const selectedSet = new Set(selectedIds);
  if (!selectedSet.has(activatedId)) return [activatedId];
  return currentItemIds.filter((id) => selectedSet.has(id));
}

/**
 * Reconciles one engine terminal outcome against application-owned order.
 * Invalid interaction-time identities cancel atomically; invalid current
 * application identities are programmer errors and always throw.
 */
export function reconcileReorder(
  currentOrder: readonly CollectionOrder[],
  sourceIds: readonly string[],
  destination: ReorderDestination
): ReorderEvent | null {
  validateCurrentOrder(currentOrder);

  const currentItemIds = currentOrder.flatMap(
    (collection) => collection.itemIds
  );
  const currentItemSet = new Set(currentItemIds);
  const requestedSourceSet = new Set(sourceIds);

  if (
    sourceIds.length === 0 ||
    sourceIds.some(
      (id) =>
        typeof id !== 'string' || id.length === 0 || !currentItemSet.has(id)
    )
  ) {
    return null;
  }

  const canonicalSourceIds = currentItemIds.filter((id) =>
    requestedSourceSet.has(id)
  );
  const destinationCollectionIndex = currentOrder.findIndex(
    (collection) => collection.sectionId === destination.sectionId
  );
  if (destinationCollectionIndex < 0) {
    return null;
  }

  const destinationCollection = currentOrder[destinationCollectionIndex]!;
  if (
    destination.beforeId != null &&
    (!currentItemSet.has(destination.beforeId) ||
      !destinationCollection.itemIds.includes(destination.beforeId) ||
      requestedSourceSet.has(destination.beforeId))
  ) {
    return null;
  }

  const nextOrder = currentOrder.map((collection) => ({
    sectionId: collection.sectionId,
    itemIds: collection.itemIds.filter((id) => !requestedSourceSet.has(id)),
  }));
  const nextDestination = nextOrder[destinationCollectionIndex]!;
  const destinationIndex =
    destination.beforeId == null
      ? nextDestination.itemIds.length
      : nextDestination.itemIds.indexOf(destination.beforeId);
  if (destinationIndex < 0) {
    return null;
  }

  nextDestination.itemIds.splice(destinationIndex, 0, ...canonicalSourceIds);
  if (ordersEqual(currentOrder, nextOrder)) {
    return null;
  }

  return {
    sourceIds: canonicalSourceIds,
    destination: {
      sectionId: destination.sectionId,
      beforeId: destination.beforeId,
    },
    nextOrder,
  };
}
