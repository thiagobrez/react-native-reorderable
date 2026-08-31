# react-native-reorderable

## 1.0.0

### Major Changes

- [`4a536f8`](https://github.com/thiagobrez/react-native-reorderable/commit/4a536f8f6153153ead532ba3d0c6e365518e1e8e) Thanks [@thiagobrez](https://github.com/thiagobrez)! - Publish the stable v1 portable reorder and drag-and-drop contract.

  The v1 support boundary is React Native 0.82–0.86 on the New Architecture and Hermes, React 19.1–19.x, Reanimated 4.3–4.6, Gesture Handler 3.x, Worklets 0.8–0.12, iOS 15.1+, and Android API 24+. The exact release candidate is validated in clean bare consumers at the minimum profile (React Native 0.82.1, React 19.1.1, Reanimated 4.3.0, Gesture Handler 3.0.0, and Worklets 0.8.1), the maximum profile (React Native 0.86.2, React 19.2.3, Reanimated 4.5.3, Gesture Handler 3.2.1, and Worklets 0.11.4), and an Expo SDK 57.0.14 development build at the maximum profile.

  The portable contract guarantees application-owned data and selection, identity-based committed reorder and drag-and-drop outcomes, atomic canonical multi-selection, semantic destination acceptance, cancellation, accessible reorder and drop actions, and list auto-scroll across the native and fallback engines. Native SwiftUI reorder is capability-dependent on iOS 27+; supported older iOS versions and Android use the fallback engine. Engine presentation may differ while application-observable semantics remain portable.

### Minor Changes

- [`a8823a5`](https://github.com/thiagobrez/react-native-reorderable/commit/a8823a5cf96ca00f12cbb2e0030328d775b3581f) Thanks [@thiagobrez](https://github.com/thiagobrez)! - Add isolated certified FlashList list and section-list wrappers backed by FlashList 2.3.

- [`6aadb73`](https://github.com/thiagobrez/react-native-reorderable/commit/6aadb7337e2d2d23769945904ca1c01899422770) Thanks [@thiagobrez](https://github.com/thiagobrez)! - Add certified optional Legend List and Legend SectionList wrappers.

- [`1ec2b63`](https://github.com/thiagobrez/react-native-reorderable/commit/1ec2b6326c2f5907e4c625fce4965285b688d6ab) Thanks [@thiagobrez](https://github.com/thiagobrez)! - Support compact, adaptively measured variable-height geometry for virtualized reorderable lists while keeping pointer coordination on the UI runtime.

- [`0eb9462`](https://github.com/thiagobrez/react-native-reorderable/commit/0eb94625ce1743963ee6da59f9c4da2739c7190f) Thanks [@thiagobrez](https://github.com/thiagobrez)! - Add a portable accessible action for dropping the current canonical selection on accepting drop zones.

- [`fef11cd`](https://github.com/thiagobrez/react-native-reorderable/commit/fef11cdb107c9da8a37a35130385ed48ab445cbf) Thanks [@thiagobrez](https://github.com/thiagobrez)! - Add the FlatList-shaped `ReorderableList` with exact identity geometry, retained virtualization, and stationary edge auto-scroll across off-window destinations.

- [`adba749`](https://github.com/thiagobrez/react-native-reorderable/commit/adba7499b3a94fed4e94e9afd6154a3f1f23ab0a) Thanks [@thiagobrez](https://github.com/thiagobrez)! - Add the SectionList-shaped `ReorderableSectionList` with section-aware rendering, section chrome geometry, empty-section destinations, and atomic cross-section reorder.

### Patch Changes

- [`9c68589`](https://github.com/thiagobrez/react-native-reorderable/commit/9c685896987998a14d5a2af712d6379c3abe5b9b) Thanks [@thiagobrez](https://github.com/thiagobrez)! - Publish canonical v1 setup, portable-contract, API, example, troubleshooting, and contribution documentation.

- [`344330f`](https://github.com/thiagobrez/react-native-reorderable/commit/344330fcab5c494bfd28039d7ab4af08d767d65d) Thanks [@thiagobrez](https://github.com/thiagobrez)! - Repair clean-checkout tests and exact-package consumer validation across Yarn,
  Expo, and Xcode 26.

- [#49](https://github.com/thiagobrez/react-native-reorderable/pull/49) [`f65d13b`](https://github.com/thiagobrez/react-native-reorderable/commit/f65d13b0e59df0f952e795b5f860b7ab1f266e4c) Thanks [@thiagobrez](https://github.com/thiagobrez)! - Isolate release device-contract sessions and evidence so mixed pointer-driver validation cannot reuse stale Detox clients or results, wait for freshly erased iOS simulators to finish booting before starting the timed contract cases, and keep iOS evidence recording outside Agent Device replays so current gesture targeting and runner recovery fixes can be used without replay lock contention. Sample native predecessor-center feedback after its longer target-resolution path has settled while the pointer remains held, route the iOS 26 fallback free-form pointer through the selector-targeted Agent Device path so feedback sampling does not race Detox's serialized drag request, and recognize the observed Android moving-preview OCR label only in its exact configuration while preserving numeric identity checks everywhere else.
