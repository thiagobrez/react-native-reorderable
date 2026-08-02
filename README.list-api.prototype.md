# Virtualized list interface prototype

> **PROTOTYPE ONLY — issue #9.** This is a throwaway artifact for choosing the
> v1 list shape. It is not implemented or exported. Validate it with
> `yarn typecheck` and delete it after the decision is captured.

## Proposed shape

Use sibling, data-driven modules for virtualized collections:

- `ReorderableList` for one collection.
- `ReorderableSectionList` for cross-section reorder.
- Keep `ReorderableContainer` / `ReorderableItem` / `ReorderableSection` for
  fully mounted, free-form layouts rather than as another long-list syntax.

The interface looks familiar to `FlatList` and `SectionList`, but the modules do
not wrap either public module. They own their scroll viewport, virtualization,
cell identity, destination feedback, and auto-scroll so both native reorder and
fallback reorder can satisfy the same portable contract.

## One collection

```tsx
import { ReorderableList } from 'react-native-reorderable';

function Tasks() {
  const [tasks, setTasks] = useState(initialTasks);

  return (
    <ReorderableList
      data={tasks}
      keyExtractor={(task) => task.id}
      renderItem={({ item }) => <TaskRow task={item} />}
      estimatedItemSize={64}
      onMove={({ nextOrder }) => {
        setTasks((current) => {
          const byId = new Map(current.map((task) => [task.id, task]));
          return (nextOrder[0]?.itemIds ?? []).flatMap((id) => {
            const task = byId.get(id);
            return task ? [task] : [];
          });
        });
      }}
    />
  );
}
```

`keyExtractor` supplies stable item identity, not a render-window key. IDs must
be non-empty and globally unique within the list. The application-owned `data`
order stays authoritative.

## Sections

```tsx
import { ReorderableSectionList } from 'react-native-reorderable';

type Board = {
  id: string;
  title: string;
  data: readonly Task[];
};

<ReorderableSectionList<Task, Board>
  sections={boards}
  keyExtractor={(task) => task.id}
  renderSectionHeader={({ section }) => (
    <BoardHeader title={section.title} />
  )}
  renderItem={({ item }) => <TaskRow task={item} />}
  onMove={({ nextOrder }) => {
    setBoards((current) => applySectionOrder(current, nextOrder));
  }}
/>;
```

Each section has a stable `id` and a `data` array, matching the useful part of
the React Native `SectionList` shape. Item IDs remain globally unique across
sections. Empty sections are valid reorder destinations.

## Off-window destinations

An invisible index is not exposed as a public destination. During pointer drag,
auto-scroll advances the library-owned viewport and materializes the next
window. Destination feedback stays on the nearest resolved insertion point
until that window is ready, then advances to the newly visible identity.

Internally, both engines keep the full identity order plus an estimated,
measurement-corrected prefix model for row geometry. `getItemLayout` or
`estimatedItemSize` improves the estimate but is not required for correctness.
At reorder commit, the shared JavaScript reconciler emits the existing
identity-based destination `{ sectionId, beforeId }`; it never exposes an index.

## What the module hides

- Window planning, mounting, measurement caches, and recycled-cell epochs.
- A dragged-item overlay that survives cell recycling.
- Native-lazy and fallback-virtualized adapters behind one private seam.
- Zero-config auto-scroll and destination feedback.
- Identity validation and atomic order reconciliation against the latest props.
- Accessible reorder through the same commit and callback path.

The implementation may use React Native virtualization machinery for the
fallback adapter and a native lazy host on capable iOS versions. Those are
implementation details rather than caller-selected list backends.

## Deliberate v1 boundaries

- Do not make `data` a prop-mode on `ReorderableContainer`; the resulting union
  of children, data, render, and section props creates too many invalid states.
- Do not ship a hook that adapts an arbitrary existing list; callers would have
  to wire the recycling, measurement, scroll ownership, and active-row rules
  that this module exists to hide.
- Do not expose `FlatList`, `FlashList`, or a custom backend adapter. A literal
  wrapper couples the native path to a JavaScript list implementation, while a
  public backend seam turns correctness-critical behavior into caller config.
- Do not implement a new general-purpose virtualizer. The library owns a narrow
  reorder coordinator and private adapters, not a replacement for every list.
- No horizontal lists, multi-column grids, custom cell wrappers, imperative
  drag start, mid-drag callbacks, or auto-scroll tuning in v1.

## Why the children interface survives

The two interfaces own different layout seams:

- The list modules own a linear scroll viewport and promise virtualization.
- The children module lets React Native styles own an arbitrary, fully mounted
  layout.

That makes the children interface useful for small rows, wraps, and custom
compositions without presenting it as a second way to build a virtualized list.

## Open reaction point

The recommendation uses two sibling modules because it keeps the common case
familiar and gives cross-section movement a first-class type. The strongest
alternative is one identity-first `ReorderableList` taking
`order: CollectionOrder[]` and `renderItem(id)`, which is smaller but forces an
ID lookup and order projection at every call site.
