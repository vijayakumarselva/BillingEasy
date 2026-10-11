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
restoreSession().catch(() => {}).then(paint).then(startNative);
