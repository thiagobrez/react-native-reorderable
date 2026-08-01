# Require the modern React Native interaction stack for v1

V1 supports React Native 0.82 through 0.86 on the New Architecture, React 19.1
through 19.x, iOS 15.1+, Android API 24+, and Hermes. Reanimated 4.3 through
4.x, Gesture Handler 3.x, and Worklets 0.8 through 0.12 are required peer
dependencies; compatible React Native, Reanimated, and Worklets combinations
must be documented and tested rather than inferred from their broad peer
ranges. These constraints keep one coherent Fabric-era implementation and an
honest fallback-reorder guarantee instead of adding legacy architecture,
JavaScriptCore, or optional-dependency branches to v1.

Expo projects require a development build because the package contains custom
native code; Expo Go is unsupported. Standard autolinking is sufficient, so v1
does not ship an Expo config plugin unless native project configuration becomes
necessary. The native reorder engine is capability-dependent on iOS 27+, while
fallback reorder is the supported engine on older iOS versions, Android, and
whenever native reorder is unavailable.

Compatibility ceilings advance only after validation. Bare React Native apps
must configure the Worklets Babel plugin; Expo's Babel preset supplies that
configuration automatically.
