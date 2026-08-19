# Application-owned selection

Pass `selectedIds` to define the current reorder selection. The library never owns selection UI or state.

When an interaction starts on a selected item, all currently present selected identities move atomically in canonical pre-move collection/item order. Selection chronology does not affect `sourceIds`. An interaction starting on an unselected item moves that item alone. Missing and duplicate selection entries are normalized away.

Selected items may be contiguous, noncontiguous, or span sections. Your renderers should expose the selected state visually and accessibly.

For drag-and-drop, `selectedIds` similarly defines the move set delivered to `canDrop` and `onDrop` when activation starts on a selected item.

Inspect the [type-checked example source](https://github.com/thiagobrez/react-native-reorderable/blob/main/example/src/reorder-scenarios.tsx).
