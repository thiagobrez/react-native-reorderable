import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    self.launchOptions = launchOptions

    let reactNativeDelegate = ReactNativeDelegate()
    reactNativeDelegate.dependencyProvider = RCTAppDependencyProvider()
    self.reactNativeDelegate = reactNativeDelegate
    reactNativeFactory = RCTReactNativeFactory(delegate: reactNativeDelegate)

    return true
  }

  func application(
    _ application: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    let handled = RCTLinkingManager.application(
      application,
      open: url,
      options: options
    )
#if DEBUG
    if
      url.host == "agent-device",
      let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
      (components.path == "/perform-accessibility-action" ||
        components.queryItems?.first(where: { $0.name == "name" })?.value
          == "perform-accessibility-action"),
      let payloadText = components.queryItems?.first(where: { $0.name == "payload" })?.value,
      let payloadData = payloadText.data(using: .utf8),
      let payload = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
      let itemLabel = payload["itemLabel"] as? String,
      let actionLabel = payload["actionLabel"] as? String,
      let containerId = payload["containerId"] as? String
    {
      NotificationCenter.default.post(
        name: Notification.Name("RNReorderableDebugAccessibilityAction"),
        object: nil,
        userInfo: [
          "itemLabel": itemLabel,
          "actionLabel": actionLabel,
          "containerId": containerId,
        ]
      )
    }
#endif
    return handled
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
