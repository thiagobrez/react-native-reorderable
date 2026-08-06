# Separate reorder and drag-and-drop interfaces

V1 exposes sibling reorder and drag-and-drop interfaces rather than one polymorphic container: reorder derives application-owned collection order, while drag-and-drop commits a move set to a semantic drop zone. The two interfaces do not interoperate or nest in v1 because they claim the same whole-item activation gesture and produce different outcomes; keeping them separate avoids invalid prop combinations and ambiguous callback routing.
