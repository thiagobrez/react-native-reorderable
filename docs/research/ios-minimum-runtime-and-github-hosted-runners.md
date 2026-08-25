# iOS minimum runtime and GitHub-hosted runners

Research date: 2026-08-25

## Conclusion

The repository chose iOS 15.1 because it is the minimum deployment target of
the supported React Native line, not because GitHub-hosted runners provide that
runtime. React Native 0.82.1 both documents iOS 15.1 as its minimum and returns
`15.1` from its CocoaPods support helper. The library deliberately adopted the
same floor, and issue #42 subsequently required the release-candidate matrix to
exercise the minimum supported iOS runtime.

GitHub-hosted runners do not currently include iOS 15 or iOS 16 simulators. The
oldest available hosted macOS image is `macos-14`, and its oldest preinstalled
iOS simulator is 17.0. That image is already being deprecated and will be
retired on 2026-11-02. On the durable `macos-15` image, the oldest currently
preinstalled iOS simulator is 18.5.

Therefore, moving the job to `macos-14` plus iOS 17.0 could make CI run today,
but it would no longer prove the advertised iOS 15.1 runtime guarantee and it
would depend on an image scheduled for retirement. Moving to `macos-15` plus
iOS 18.5 is more durable, but weakens runtime coverage further. A hosted build
can still verify that the project and pods declare a 15.1 deployment target;
only launching on an actual 15.1 simulator/device verifies runtime behavior at
that floor.

## Evidence

- React Native 0.82.1 says applications may target iOS 15.1 or newer in its
  [requirements](https://github.com/facebook/react-native/blob/v0.82.1/README.md#requirements),
  and its CocoaPods helper defines both
  [iOS 15.1 as the minimum deployment target and Xcode 16.1 as the minimum Xcode](https://github.com/facebook/react-native/blob/v0.82.1/packages/react-native/scripts/cocoapods/helpers.rb#L83-L89).
- This repository's v1 support decision explicitly selects React Native
  0.82–0.86 and iOS 15.1+ in
  [ADR 0002](https://github.com/thiagobrez/react-native-reorderable/blob/5c0f3832d716a433b91774e03c723d832058ef1f/docs/adr/0002-v1-platform-and-dependency-support.md).
  Its podspec obtains the deployment target from React Native's
  [`min_ios_version_supported`](https://github.com/thiagobrez/react-native-reorderable/blob/5c0f3832d716a433b91774e03c723d832058ef1f/Reorderable.podspec#L13),
  so the library and its supported React Native baseline are aligned.
- [Issue #42](https://github.com/thiagobrez/react-native-reorderable/issues/42)
  requires nightly and prerelease matrices to cover the minimum supported iOS
  and Android runtimes. The resulting workflow's
  [minimum-runtime job](https://github.com/thiagobrez/react-native-reorderable/blob/5c0f3832d716a433b91774e03c723d832058ef1f/.github/workflows/exact-package-candidate.yml#L443-L507)
  expressly boots iOS 15.1, installs the exact packed candidate, and launches a
  React Native 0.82.1 clean consumer.
- GitHub's current runner-image catalog lists macOS 14, 15, and 26 as hosted
  images in its
  [supported-images table](https://github.com/actions/runner-images/blob/564e58dbe650c507ccba1171f6159c12f26820c8/README.md#available-images).
- The pinned current manifests show that the oldest simulator on
  [`macos-14` is iOS 17.0](https://github.com/actions/runner-images/blob/564e58dbe650c507ccba1171f6159c12f26820c8/images/macos/macos-14-Readme.md#installed-simulators),
  while the oldest simulator on
  [`macos-15` is iOS 18.5](https://github.com/actions/runner-images/blob/564e58dbe650c507ccba1171f6159c12f26820c8/images/macos/macos-15-Readme.md#installed-simulators).
  Neither manifest contains an iOS 15 or 16 runtime.
- GitHub's official
  [macOS 14 deprecation notice](https://github.com/actions/runner-images/issues/13518)
  says deprecation began on 2026-07-06 and full retirement is scheduled for
  2026-11-02; it directs workflows toward macOS 15 or 26.

## Practical choices

1. Keep the current self-hosted iOS 15.1 gate if the release claim must include
   tested runtime behavior on the exact minimum supported OS.
2. Use `macos-15` and iOS 18.5 for a maintainable hosted gate, while describing
   it honestly as deployment-target validation plus oldest practical hosted
   runtime coverage—not minimum-runtime validation.
3. Use `macos-14` and iOS 17.0 only as a short-lived bridge; it supplies the
   lowest hosted runtime today, but retirement makes it unsuitable as the
   long-term answer.

## Decision

On 2026-08-25 the project selected option 2: keep explicit deployment-target
validation at iOS 15.1, and run the clean minimum-dependency consumer on the
durable GitHub-hosted `macos-15` image with its iOS 18.5 simulator.
