# Use data-driven wrappers for virtualized reorder lists

V1 exposes sibling data-driven list and section-list modules, while retaining
the children interface only for fully mounted, free-form layouts. The root
exports wrap React Native's FlatList and SectionList; FlashList and Legend List
wrappers live in isolated optional entrypoints so their peer packages are
installed only by callers who choose them, and each wrapper forwards its safe
implementation-specific props while the library owns cell, scroll, identity,
geometry, and reorder-critical props. Stable identity is always explicit
through `keyExtractor`, and the library-owned `getItemLayout` contract supplies
the shared geometry coordinator even when an underlying list uses different
sizing semantics.
