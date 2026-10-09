import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./app/App.tsx";
import { preloadAllWhenIdle } from "./lib/lazy-preload";
import { registerServiceWorker } from "./register-sw";
import "@repo/ui/styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
preloadAllWhenIdle();
