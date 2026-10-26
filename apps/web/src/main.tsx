import { applyStoredAccent } from "@repo/ui/providers/ThemeProvider";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App, { THEME_STORAGE_KEY } from "./app/App.tsx";
import { preloadAllWhenIdle } from "./lib/lazy-preload";
import { registerServiceWorker } from "./register-sw";
import "@repo/ui/styles/globals.css";

applyStoredAccent(THEME_STORAGE_KEY);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
preloadAllWhenIdle();
