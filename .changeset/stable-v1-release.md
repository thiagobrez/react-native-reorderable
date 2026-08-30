---
'react-native-reorderable': major
---

Publish the stable v1 portable reorder and drag-and-drop contract.

The v1 support boundary is React Native 0.82–0.86 on the New Architecture and Hermes, React 19.1–19.x, Reanimated 4.3–4.6, Gesture Handler 3.x, Worklets 0.8–0.12, iOS 15.1+, and Android API 24+. The exact release candidate is validated in clean bare consumers at the minimum profile (React Native 0.82.1, React 19.1.1, Reanimated 4.3.0, Gesture Handler 3.0.0, and Worklets 0.8.1), the maximum profile (React Native 0.86.2, React 19.2.3, Reanimated 4.5.3, Gesture Handler 3.2.1, and Worklets 0.11.4), and an Expo SDK 57.0.14 development build at the maximum profile.

The portable contract guarantees application-owned data and selection, identity-based committed reorder and drag-and-drop outcomes, atomic canonical multi-selection, semantic destination acceptance, cancellation, accessible reorder and drop actions, and list auto-scroll across the native and fallback engines. Native SwiftUI reorder is capability-dependent on iOS 27+; supported older iOS versions and Android use the fallback engine. Engine presentation may differ while application-observable semantics remain portable.
