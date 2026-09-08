import UIKit
import ObjectiveC
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
    installIssue84TouchDiagnostics()
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

@MainActor
private var issue84TouchStarts: [ObjectIdentifier: (arrival: Double, timestamp: Double, moved: Bool)] = [:]

@MainActor
private var issue84ApplicationTouches: [ObjectIdentifier: Bool] = [:]

@MainActor
private var issue84MainLoopLastWake: Double = 0

@MainActor
private var issue84MainLoopLastSleep: Double = 0

@MainActor
private func installIssue84TouchDiagnostics() {
  guard let original = class_getInstanceMethod(UIWindow.self, #selector(UIWindow.sendEvent(_:))),
        let diagnostic = class_getInstanceMethod(UIWindow.self, #selector(UIWindow.issue84SendEvent(_:))),
        let applicationOriginal = class_getInstanceMethod(UIApplication.self, #selector(UIApplication.sendEvent(_:))),
        let applicationDiagnostic = class_getInstanceMethod(UIApplication.self, #selector(UIApplication.issue84ApplicationSendEvent(_:))) else {
    fatalError("ISSUE84_TOUCH could not install application/window event probes")
  }
  method_exchangeImplementations(original, diagnostic)
  method_exchangeImplementations(applicationOriginal, applicationDiagnostic)
  let activities = CFRunLoopActivity.beforeWaiting.rawValue | CFRunLoopActivity.afterWaiting.rawValue
  guard let observer = CFRunLoopObserverCreateWithHandler(nil, activities, true, 0, { _, activity in
    MainActor.assumeIsolated {
      let now = ProcessInfo.processInfo.systemUptime
      if activity == .afterWaiting {
        issue84MainLoopLastWake = now
      } else if activity == .beforeWaiting {
        issue84MainLoopLastSleep = now
      }
    }
  }) else {
    fatalError("ISSUE84_TOUCH could not install main run-loop observer")
  }
  CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .commonModes)
}

private extension UIApplication {
  @objc func issue84ApplicationSendEvent(_ event: UIEvent) {
    let arrivedAt = ProcessInfo.processInfo.systemUptime
    let lastWake = issue84MainLoopLastWake
    let lastSleep = issue84MainLoopLastSleep
    var observations: [(phase: Int, timestamp: Double)] = []
    if event.type == .touches {
      for touch in event.allTouches ?? [] {
        let key = ObjectIdentifier(touch)
        let firstObserved = issue84ApplicationTouches[key] == nil
        let firstMovement = touch.phase == .moved && issue84ApplicationTouches[key] == false
        if firstObserved {
          issue84ApplicationTouches[key] = false
        }
        if firstMovement {
          issue84ApplicationTouches[key] = true
        }
        if firstObserved || firstMovement || touch.phase == .began || touch.phase == .ended || touch.phase == .cancelled {
          observations.append((touch.phase.rawValue, touch.timestamp))
        }
        if touch.phase == .ended || touch.phase == .cancelled {
          issue84ApplicationTouches.removeValue(forKey: key)
        }
      }
    }
    issue84ApplicationSendEvent(event)
    let returnedAt = ProcessInfo.processInfo.systemUptime
    for observation in observations {
      NSLog("ISSUE84_APP_EVENT phase=%ld timestamp=%.6f arrival=%.6f handlingMs=%.1f lastWake=%.6f lastSleep=%.6f",
            observation.phase, observation.timestamp, arrivedAt, (returnedAt - arrivedAt) * 1000,
            lastWake, lastSleep)
    }
  }
}

private extension UIWindow {
  @objc func issue84SendEvent(_ event: UIEvent) {
    let arrivedAt = ProcessInfo.processInfo.systemUptime
    issue84SendEvent(event)
    guard event.type == .touches else { return }
    for touch in event.allTouches ?? [] {
      let key = ObjectIdentifier(touch)
      let firstObserved = issue84TouchStarts[key] == nil
      if firstObserved {
        issue84TouchStarts[key] = (arrivedAt, touch.timestamp, false)
      }
      let start = issue84TouchStarts[key]
      if touch.phase == .moved {
        guard let start, !start.moved else { continue }
        issue84TouchStarts[key] = (start.arrival, start.timestamp, true)
      } else if !firstObserved && touch.phase != .began && touch.phase != .ended && touch.phase != .cancelled {
        continue
      }
      let point = touch.location(in: self)
      var target: [String] = []
      var view = touch.view
      while let current = view, target.count < 8 {
        target.append("\(NSStringFromClass(type(of: current)))#\(current.accessibilityIdentifier ?? "")")
        view = current.superview
      }
      let recognizers = (touch.gestureRecognizers ?? []).prefix(12).map {
        "\(NSStringFromClass(type(of: $0))):\($0.state.rawValue)"
      }.joined(separator: ",")
      NSLog("ISSUE84_TOUCH phase=%ld first=%d timestamp=%.6f arrival=%.6f timestampDeltaMs=%.1f arrivalDeltaMs=%.1f point=(%.1f,%.1f) target=%@ recognizers=%@",
            touch.phase.rawValue, firstObserved ? 1 : 0, touch.timestamp, arrivedAt,
            (touch.timestamp - (start?.timestamp ?? touch.timestamp)) * 1000,
            (arrivedAt - (start?.arrival ?? arrivedAt)) * 1000,
            Double(point.x), Double(point.y), target.joined(separator: "/"), recognizers)
      if touch.phase == .ended || touch.phase == .cancelled {
        issue84TouchStarts.removeValue(forKey: key)
      }
    }
  }
}
