// Everything that only makes sense when we are a real app on a real device.
//
// Each piece is wrapped: on the web these plugins are not present, and a
// failure here must never stop the app rendering.
import { isCapacitor, isIosApp } from "@/lib/mobile";

export async function startNative() {
  if (!isCapacitor) return;

  // Lets the stylesheet drop the browser-isms (selection magnifier, tap
  // highlight, rubber-band scroll) only where we are really an app.
  document.body.classList.add("is-native");
  if (isIosApp) document.body.classList.add("is-ios");

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // The header is a dark blue, so the clock and battery need to be light.
    await StatusBar.setStyle({ style: Style.Dark });
    if (!isIosApp) await StatusBar.setBackgroundColor({ color: "#1d4ed8" });
  } catch { /* no status bar to style */ }

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch { /* already gone */ }

  try {
    const { App } = await import("@capacitor/app");
    // Android's hardware back button should walk our history, not quit.
    // iOS has no such button and Capacitor's proxy throws if we ask for it.
    if (!isIosApp) {
      App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else App.exitApp();
      });
    }
    // A deep link (billingseasy.com/sales/123) opens the right screen.
    App.addListener("appUrlOpen", ({ url }) => {
      try {
        const path = new URL(url).pathname;
        if (path && path !== "/") window.location.href = path;
      } catch { /* not a URL we can route */ }
    });
  } catch { /* not running under Capacitor after all */ }

  try {
    const { Network } = await import("@capacitor/network");
    const paint = (connected) => {
      document.body.classList.toggle("is-offline", !connected);
    };
    paint((await Network.getStatus()).connected);
    Network.addListener("networkStatusChange", (s) => paint(s.connected));
  } catch { /* assume online */ }
}

/** A short tap of feedback — used where an action is destructive or final. */
export async function tap(style = "medium") {
  if (!isCapacitor) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle[style === "light" ? "Light" : "Medium"] });
  } catch { /* no haptics */ }
}
