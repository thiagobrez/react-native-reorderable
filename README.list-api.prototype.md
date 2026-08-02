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

The default modules wrap React Native's `FlatList` and `SectionList`. Optional
entrypoints wrap FlashList and Legend List. Every wrapper owns the
correctness-critical parts of its scroll viewport, cell identity, destination
feedback, and auto-scroll so native reorder and fallback reorder satisfy the
same portable contract.

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

## Choosing a list implementation

The root entrypoint uses React Native's built-in lists; no other list package is
installed or required:

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
  ReorderableFlashList,
} from 'react-native-reorderable/flash-list';

<ReorderableFlashList
  data={tasks}
  keyExtractor={(task) => task.id}
  renderItem={({ item }) => <TaskRow task={item} />}
  drawDistance={500}
  onMove={applyTaskOrder}
/>;
```

Legend List is independently opt-in:

```sh
npm install @legendapp/list
```

```tsx
import {
  ReorderableLegendSectionList,
} from 'react-native-reorderable/legend-list';

<ReorderableLegendSectionList
  sections={boards}
  keyExtractor={(task) => task.id}
  renderItem={({ item }) => <TaskRow task={item} />}
  recycleItems
  onMove={applyBoardOrder}
/>;
```

Each wrapper inherits its underlying list's props and forwards the safe ones.
It reserves props that control reorder correctness: `data`, `sections`,
`renderItem`, `keyExtractor`, `getItemLayout`, cell and scroll renderers,
orientation, inversion, columns, and visible-content-position maintenance.
Caller callbacks such as `onScroll` are composed with internal handlers rather
than replacing them. All wrappers pass the same conformance suite for identity,
recycling, variable-height measurement, empty sections, off-window traversal,
auto-scroll, cancellation, and atomic reorder commit.

The optional entrypoints export both shapes:

- `ReorderableFlashList` and `ReorderableFlashSectionList`.
- `ReorderableLegendList` and `ReorderableLegendSectionList`.

Their refs and safe implementation-specific props retain the underlying list's
types. Supported dependency majors are explicit because a new FlashList or
Legend List interface may require a corresponding wrapper update.

The package manifest keeps optional libraries out of the default install:

```jsonc
{
  "exports": {
    ".": "...",
    "./flash-list": "...",
    "./legend-list": "..."
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

The root entrypoint must not import or re-export either optional entrypoint.
Each optional module imports only its corresponding peer. The library installs
both as development dependencies solely to build and run conformance tests;
consumers receive neither unless they choose and install it.

The selected list remains the viewport under both reorder engines. If native
reorder cannot integrate with a particular list implementation, native reorder
is unavailable for that wrapper and `engine="auto"` selects fallback reorder;
the wrapper never accepts backend props and silently renders a different list.

## Off-window destinations

An invisible index is not exposed as a public destination. During pointer drag,
auto-scroll advances the library-owned viewport and materializes the next
window. Destination feedback stays on the nearest resolved insertion point
until that window is ready, then advances to the newly visible identity.

Internally, both engines keep the full identity order plus an estimated,
measurement-corrected prefix model for row geometry. The library-owned
`getItemLayout` retains the FlatList signature and supplies exact geometry to
the coordinator. It is forwarded to FlatList, consumed only by the coordinator
for FlashList, and translated to Legend List's fixed-size hint where possible.
At reorder commit, the shared JavaScript reconciler emits the existing
identity-based destination `{ sectionId, beforeId }`; it never exposes an index.

## What the module hides

- Window planning, mounting, measurement caches, and recycled-cell epochs.
- A dragged-item overlay that survives cell recycling.
- Native reorder and the selected list implementation behind one
  correctness-critical internal seam.
- Zero-config auto-scroll and destination feedback.
- Identity validation and atomic order reconciliation against the latest props.
- Accessible reorder through the same commit and callback path.

The three public wrappers delegate order reconciliation, auto-scroll, drag
state, accessibility, and engine selection to one deep internal module; their
list-specific code is limited to viewport integration and prop translation.

## Deliberate v1 boundaries

- Do not make `data` a prop-mode on `ReorderableContainer`; the resulting union
  of children, data, render, and section props creates too many invalid states.
- Do not ship a hook that adapts an arbitrary existing list; callers would have
  to wire the recycling, measurement, scroll ownership, and active-row rules
  that this module exists to hide.
- Do not expose a generic `adapter` prop or caller-authored adapter interface in
  v1. Each supported list gets a typed, tested wrapper from an isolated
  entrypoint.
- Do not forward correctness-critical list props. Safe presentation,
  performance, callback, and ref props keep their underlying list types.
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

## Decision reached

V1 uses sibling list and section-list modules. The default root exports wrap
React Native lists; optional FlashList and Legend List wrappers live in isolated
subpath exports and forward their safe implementation-specific props. The
children interface survives only for fully mounted, free-form layouts.
