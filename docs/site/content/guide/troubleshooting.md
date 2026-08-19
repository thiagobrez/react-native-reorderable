# Troubleshooting

## “No reorder engine can fulfill…”

Confirm Gesture Handler, Reanimated, and Worklets match the compatibility matrix, native modules are linked, and the app was rebuilt. Expo Go cannot load this package; use a development build.

## Worklets or workletization errors

Bare React Native apps must put `react-native-worklets/plugin` last in Babel plugins and restart Metro with its cache cleared. Expo's preset configures it automatically.

## A reorder snaps back

The interface is controlled. Update application data from `event.nextOrder`. If you intentionally retain the old order, visual restoration is expected.

## A callback never fires

Check the [cancellation inputs](./cancellation), `enabled`, stable identities, and drop acceptance. Releasing over a rejecting zone or outside a valid destination emits no callback by contract.

## A list destination is inaccurate

Verify exact offsets include all earlier content, especially section headers and footers. For measured rows, use a representative `estimatedItemSize` and do not change row identity while dragging.

## Nested controls stop receiving short presses

The whole item is the long-press activation region, but short presses remain available to nested controls. Ensure application gesture wrappers are not exclusively claiming the same gesture.

For usage questions, use [GitHub Discussions](https://github.com/thiagobrez/react-native-reorderable/discussions). Report reproducible contract failures with the public bug template.
