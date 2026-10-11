import UIKit
import Capacitor

/// iOS 27 (the SDK Xcode 27 builds against) refuses to launch an app that
/// still uses the old `UIApplicationDelegate` window lifecycle:
///
///   "Application failed to launch: UIScene life cycle is required for apps
///    built with this SDK."
///
/// Capacitor's own template has not adopted scenes yet, so this is ours. It
/// does what the storyboard used to do implicitly — put the bridge view
/// controller on screen — and forwards the two events Capacitor's plugins
/// listen for: a URL opened into the app, and a Universal Link continued.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = CAPBridgeViewController()
        window.makeKeyAndVisible()
        self.window = window

        // A cold start from a deep link arrives here rather than in the
        // AppDelegate, so hand it on or the link is silently dropped.
        if let url = connectionOptions.urlContexts.first?.url {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared, open: url, options: [:])
        }
        if let activity = connectionOptions.userActivities.first {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared, continue: activity, restorationHandler: { _ in })
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared, open: url, options: [:])
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
