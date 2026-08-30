/** @type {Detox.DetoxConfig} */
// Device-contract harness: Detox 20.51.4, pinned in package.json/yarn.lock.
module.exports = {
  session: {
    // Android 16 may resolve localhost to IPv6 while adb reverse exposes the
    // host listener over IPv4. Keep Detox's managed server and tunnel on the
    // same explicit loopback address.
    server: process.env.ISSUE39_DETOX_SERVER_URL ?? 'ws://127.0.0.1:8099',
    autoStart: true,
  },
  testRunner: {
    args: {
      config: 'e2e/jest.config.cjs',
      maxWorkers: 1,
      testTimeout: 180000,
    },
    jest: {
      setupTimeout: 180000,
      teardownTimeout: 30000,
    },
    retries: 0,
  },
  artifacts: {
    rootDir: 'artifacts/issue-39/detox',
    plugins: {
      log: 'all',
      screenshot: 'all',
      video: 'all',
      uiHierarchy: 'enabled',
    },
  },
  behavior: {
    launchApp: 'auto',
    init: {
      reinstallApp: true,
      exposeGlobals: true,
    },
    cleanup: {
      shutdownDevice: false,
    },
  },
  apps: {
    'ios.release': {
      type: 'ios.app',
      bundleId: 'reorderable.example',
      binaryPath:
        'example/ios/build/Build/Products/Release-iphonesimulator/ReorderableExample.app',
      build:
        'cd example/ios && xcodebuild -workspace ReorderableExample.xcworkspace -scheme ReorderableExample -configuration Release -sdk iphonesimulator -derivedDataPath build CODE_SIGNING_ALLOWED=NO',
    },
    'android.release': {
      type: 'android.apk',
      bundleId: 'reorderable.example',
      binaryPath:
        'example/android/app/build/outputs/apk/release/app-release.apk',
      testBinaryPath:
        'example/android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk',
      build:
        'cd example/android && ./gradlew :app:assembleRelease :app:assembleAndroidTest -DtestBuildType=release -PdetoxBuild=true --no-daemon --console=plain',
    },
  },
  devices: {
    ios27: {
      type: 'ios.simulator',
      device: { type: 'iPhone 17 Pro', os: 'iOS 27.0' },
    },
    ios26: {
      type: 'ios.simulator',
      device: { type: 'iPhone 17 Pro', os: 'iOS 26.5' },
    },
    android: {
      type: 'android.emulator',
      device: { avdName: 'Pixel_10_Pro' },
      headless: true,
      readonly: false,
    },
  },
  configurations: {
    'ios27.native': { device: 'ios27', app: 'ios.release' },
    'ios27.fallback': { device: 'ios27', app: 'ios.release' },
    'ios26.auto-fallback': { device: 'ios26', app: 'ios.release' },
    'android.fallback': { device: 'android', app: 'android.release' },
  },
};
