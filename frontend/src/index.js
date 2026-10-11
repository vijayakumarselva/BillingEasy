import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";
import { startNative } from "@/lib/native";
import { restoreSession } from "@/lib/offline";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

// A white screen tells nobody anything — least of all on a phone, where there
// is no console to open. If the app cannot start, say so on screen.
let started = false;      // set once React has actually put something on screen

function fatal(what, err) {
  const msg = [err?.name, err?.message, err?.stack].filter(Boolean).join("\n")
    || String(err) || "No further detail.";
  const el = document.getElementById("root");
  // React 19 commits asynchronously, so an error moments after render() must
  // not blank a page that is about to appear.
  if (started || !el || el.childElementCount > 0) return;
  el.innerHTML = `
    <div style="font:14px -apple-system,system-ui,sans-serif;padding:24px;
                padding-top:calc(24px + env(safe-area-inset-top,0px));color:#0f172a">
      <h1 style="font-size:17px;margin:0 0 6px">BillingsEasy could not start</h1>
      <p style="color:#64748b;margin:0 0 14px">${what}</p>
      <pre style="white-space:pre-wrap;word-break:break-word;background:#f1f5f9;
                  border-radius:8px;padding:12px;font-size:11px;max-height:50vh;
                  overflow:auto">${msg.replace(/[<&]/g, (c) => c === "<" ? "&lt;" : "&amp;")}</pre>
      <button onclick="location.reload()" style="margin-top:14px;background:#2563eb;
              color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:600">
        Try again
      </button>
    </div>`;
}
window.addEventListener("error", (e) => fatal("Something broke while loading.", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => fatal("Something broke while loading.", e.reason));

const root = ReactDOM.createRoot(document.getElementById("root"));

const paint = () => root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

// On a device the session may need lifting back out of Preferences first —
// otherwise the app flashes the login screen at someone who is signed in.
restoreSession()
  .catch(() => {})                       // a missing store is not fatal
  .then(paint)
  .then(() => { started = true; })
  .then(startNative)
  .catch((err) => fatal("The app failed to start.", err));
