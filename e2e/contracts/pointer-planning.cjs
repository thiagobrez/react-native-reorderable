function predecessorBeforeTarget(order, sourceIds, destination) {
  const sourceSet = new Set(sourceIds);
  if (sourceSet.size !== sourceIds.length || sourceSet.size === 0) {
    throw new Error('Pointer move set must contain unique source identities');
  }
  const available = new Set(order.flatMap(({ itemIds }) => itemIds));
  for (const sourceId of sourceSet) {
    if (!available.has(sourceId))
      throw new Error(`Unknown pointer source identity ${sourceId}`);
  }
  const collection = order.find(
    ({ sectionId }) => sectionId === destination.sectionId
  );
  if (collection == null)
    throw new Error(`Unknown destination collection ${destination.sectionId}`);
  const survivors = collection.itemIds.filter((id) => !sourceSet.has(id));
  const targetIndex = survivors.indexOf(destination.beforeId);
  if (targetIndex < 0)
    throw new Error(`Unknown or moving destination ${destination.beforeId}`);
  return targetIndex === 0 ? null : survivors[targetIndex - 1];
}

module.exports = { predecessorBeforeTarget };
