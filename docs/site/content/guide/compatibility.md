# Compatibility table

The library version is on the vertical axis and the compared dependency version is on the horizontal axis. Each minor-version column assumes the latest patch release in that minor line.

## Supported React Native versions

| react-native-reorderable | 0.81                                     | 0.82                                       | 0.83                                       | 0.84                                       | 0.85                                       | 0.86                                       | 0.87                                     |
| ------------------------ | ---------------------------------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ---------------------------------------- |
| 1.0.x                    | <span class="compatibility-no">no</span> | <span class="compatibility-yes">yes</span> | <span class="compatibility-yes">yes</span> | <span class="compatibility-yes">yes</span> | <span class="compatibility-yes">yes</span> | <span class="compatibility-yes">yes</span> | <span class="compatibility-no">no</span> |

React Native's New Architecture is required.

## Supported Reanimated versions

| react-native-reorderable | 4.2.x                                    | 4.3.x                                      | 4.4.x                                      | 4.5.x                                      | 4.6.x                                      |
| ------------------------ | ---------------------------------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| 1.0.x                    | <span class="compatibility-no">no</span> | <span class="compatibility-yes">yes</span> | <span class="compatibility-yes">yes</span> | <span class="compatibility-yes">yes</span> | <span class="compatibility-yes">yes</span> |

## Supported Gesture Handler versions

| react-native-reorderable | 2.x                                      | 3.x                                        |
| ------------------------ | ---------------------------------------- | ------------------------------------------ |
| 1.0.x                    | <span class="compatibility-no">no</span> | <span class="compatibility-yes">yes</span> |

## Supported Worklets versions

| react-native-reorderable | 0.7.x                                    | 0.8.x                                      | 0.9.x                                      | 0.10.x                                     | 0.11.x                                     | 0.12.x                                     |
| ------------------------ | ---------------------------------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| 1.0.x                    | <span class="compatibility-no">no</span> | <span class="compatibility-yes">yes</span> | <span class="compatibility-yes">yes</span> | <span class="compatibility-yes">yes</span> | <span class="compatibility-yes">yes</span> | <span class="compatibility-yes">yes</span> |

V1 also requires React 19.1–19.x, iOS 15.1+, Android API 24+, and Hermes.

## Validated dependency combinations

The peer ranges above describe the supported boundary; they do not claim that
every permutation inside the ranges has been validated. Candidate CI compiles
these complete combinations in clean bare React Native consumers:

| Profile | React Native | React  | Reanimated | Gesture Handler | Worklets |
| ------- | ------------ | ------ | ---------- | --------------- | -------- |
| Minimum | 0.82.1       | 19.1.1 | 4.3.0      | 3.0.0           | 0.8.1    |
| Maximum | 0.86.2       | 19.2.3 | 4.5.3      | 3.2.1           | 0.11.4   |

The same candidate also compiles in a clean Expo SDK 57.0.14 development
build at the maximum profile.

All validation uses the New Architecture and Hermes. Expo Go, the Legacy
Architecture, and JavaScriptCore are outside the v1 support boundary.
