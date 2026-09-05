# Reorderable example app

The example app is the runnable contract for `react-native-reorderable`. It has
three top-level areas:

- **Examples** teaches the five public composition patterns with the automatic
  engine policy.
- **Scenario Lab** provides deterministic stress and edge-case presets. This is
  the only area that exposes the Auto/Fallback policy switch.
- **Integrations** exercises the public FlashList and Legend List adapters with
  focused list and section-list examples.

Every scenario has a Reset action and visible order, selection, last committed
event, and callback-count state. Test IDs identify the same controls used by a
person; there is no separate E2E-only copy of a scenario.

## Run the app

From the repository root, start Metro and then build the desired platform:

```sh
yarn example start
yarn build:ios
yarn build:android
```

See React Native's [environment setup guide](https://reactnative.dev/docs/set-up-your-environment)
for the native prerequisites.

## Stable scenario links

Scenario links encode the area, scenario, preset, and requested engine policy:

```text
reorderable://<area>/<scenario>?preset=<preset>&engine=<auto|fallback>
```

For example:

```text
reorderable://lab/selection?preset=contiguous&engine=fallback
reorderable://examples/virtualized-list?preset=teaching&engine=auto
reorderable://integrations/flash-section-list?preset=focused&engine=auto
```

Examples and Integrations always normalize the engine to Auto. Scenario Lab
remounts the selected scenario when its policy changes so each run begins from
a deterministic state.
