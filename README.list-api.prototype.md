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
not expose the underlying list interface. They own their scroll viewport,
virtualization, cell identity, destination feedback, and auto-scroll so both
native reorder and fallback reorder can satisfy the same portable contract.

The built-in adapter uses React Native's `FlatList`. Certified adapters for
FlashList and Legend List are available from isolated package subpaths.

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

## Choosing a viewport adapter

Omitting `adapter` uses React Native's built-in `FlatList`; no other list
package is installed or required:

```tsx
<ReorderableList
  data={tasks}
  keyExtractor={(task) => task.id}
  renderItem={({ item }) => <TaskRow task={item} />}
  onMove={applyTaskOrder}
/>;
```

FlashList is opt-in:

```sh
npm install @shopify/flash-list
```

```tsx
import {
  flashListAdapter,
} from 'react-native-reorderable/adapters/flash-list';

<ReorderableList
  adapter={flashListAdapter}
  data={tasks}
  keyExtractor={(task) => task.id}
  renderItem={({ item }) => <TaskRow task={item} />}
  onMove={applyTaskOrder}
/>;
```

Legend List is independently opt-in:

```sh
npm install @legendapp/list
```

```tsx
import {
  legendListAdapter,
} from 'react-native-reorderable/adapters/legend-list';

<ReorderableSectionList
  adapter={legendListAdapter}
  sections={boards}
  keyExtractor={(task) => task.id}
  renderItem={({ item }) => <TaskRow task={item} />}
  onMove={applyBoardOrder}
/>;
```

The adapters are opaque, library-certified values. They do not expose the
underlying list's full props or permit arbitrary caller-authored adapters in
v1. All three adapters must pass the same conformance suite for identity,
recycling, variable-height measurement, empty sections, off-window traversal,
auto-scroll, cancellation, and atomic reorder commit.

The package manifest keeps optional libraries out of the default install:

```jsonc
{
  "exports": {
    ".": "...",
    "./adapters/flash-list": "...",
    "./adapters/legend-list": "..."
  },
  "peerDependencies": {
    "@shopify/flash-list": "<supported range>",
    "@legendapp/list": "<supported range>"
  },
  "peerDependenciesMeta": {
    "@shopify/flash-list": { "optional": true },
    "@legendapp/list": { "optional": true }
  }
}
```

The root entry point must not statically import either adapter subpath. Each
adapter module imports only its corresponding peer. The library installs both
as development dependencies solely to build and run its adapter conformance
tests; consumers receive neither unless they choose and install it.

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
- Native reorder and FlatList, FlashList, or Legend List viewport integration
  behind one correctness-critical internal seam.
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
- Do not expose `FlatList`, FlashList, or Legend List props wholesale. Certified
  opaque adapters may vary viewport implementation without turning
  correctness-critical behavior into caller configuration.
- Do not expose an arbitrary custom-backend interface in v1. Additional
  adapters graduate only after passing the shared conformance suite.
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
