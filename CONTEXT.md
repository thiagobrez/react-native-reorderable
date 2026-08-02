# Reorderable

The language for a React Native library that reorders items within and between
collections and supports drag-and-drop interactions.

## Language

**Native reorder**:
Reordering performed by a platform-native engine when that capability is
available. It does not imply that every supported platform or runtime uses the
native engine.
_Avoid_: Native-only reorder, universally native reorder

**Fallback reorder**:
Reordering performed by the library's cross-platform engine when native reorder
is unavailable. It is supported behaviour, not a degraded or no-op mode.
_Avoid_: Non-native reorder, degraded reorder

**Portable contract**:
The behaviour and interface guaranteed identically by both native reorder and
fallback reorder. Engine-specific abilities are not part of this contract.
_Avoid_: Common-denominator API, parity layer

**Reorder commit**:
The moment an engine accepts a completed drop and fixes its final destination.
It precedes the reorder callback and is distinct from visual settling or the
application persisting the resulting order.
_Avoid_: Animation completion, application commit

**Reorder destination**:
An insertion point identified by a collection and either the item that follows
the insertion or the end of that collection.
_Avoid_: Destination index, drop index

**Move set**:
The items committed together in one reorder, normalized into their canonical
pre-move collection and item order rather than selection chronology.
_Avoid_: Selected items, source array

**Order reconciliation**:
The translation of a committed move against the application-owned current order
into the portable callback payload and resulting order.
_Avoid_: Engine order, native reconciliation

**Engine policy**:
A container's caller-selected constraint on engine selection: automatically
prefer native reorder when available, or require fallback reorder.
_Avoid_: Engine capability, native availability

**Destination feedback**:
The continuously updated, visible indication of the reorder destination that
would be committed if the active drag ended now.
_Avoid_: Destination event, native placeholder

**Cancelled reorder**:
A drag that ends without a reorder commit. It emits no reorder callback and
leaves application order unchanged.
_Avoid_: Rejected move, reverted commit

**Accessible reorder**:
A reorder completed through an assistive-technology interaction rather than a
pointer drag, with the same reorder commit and callback semantics.
_Avoid_: Accessibility fallback, simulated drag

**Drag activation region**:
The part of an item from which a pointer drag may begin. V1 defines the whole
item as the portable drag activation region.
_Avoid_: Handle area, draggable zone

**Visual grip**:
A user-authored visual cue that suggests an item can be dragged without
restricting its drag activation region.
_Avoid_: Drag handle, handle component

**Drag handle**:
An interactive subregion that exclusively starts a pointer drag. It is not part
of the v1 portable contract.
_Avoid_: Visual grip

**Auto-scroll**:
Traversal of a library-owned scroll viewport during a drag that exposes reorder
destinations beyond the currently visible content. Its availability is
contractual and always enabled; its thresholds, velocity, and other motion are
private engine behaviour rather than caller configuration.
_Avoid_: Edge animation, scroll feel

**Atomic reorder**:
A reorder whose complete move set and destination are reconciled together
against the latest application order, or not committed at all.
_Avoid_: Partial move, best-effort move
