# Cancellation

A cancelled reorder or drag-and-drop interaction emits no callback and leaves application order unchanged. Only one terminal outcome can win, so a late lifecycle signal cannot replace an accepted commit.

Pointer interactions cancel on:

- gesture failure/interruption or release outside a valid destination;
- the app becoming inactive or backgrounded;
- Android window blur or hardware Back;
- `enabled` changing to `false`;
- container unmount;
- an active source, destination, identity, or relevant structure disappearing;
- total loss of the engine required to fulfill the portable contract.

Dropping over a rejecting zone is also a cancellation, not a callback that the application must veto. Accessible boundary actions and inaccessible/rejecting drops announce unavailability and do not commit.
