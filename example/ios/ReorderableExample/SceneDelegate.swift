import UIKit
import React

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let reactNativeFactory = appDelegate.reactNativeFactory
    else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window

    reactNativeFactory.startReactNative(
      withModuleName: "ReorderableExample",
      in: window,
      launchOptions: appDelegate.launchOptions
    )
  }

  func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
    guard let url = contexts.first?.url else { return }
    _ = (UIApplication.shared.delegate as? AppDelegate)?.application(
      UIApplication.shared,
      open: url,
      options: [:]
    )
  }
}
