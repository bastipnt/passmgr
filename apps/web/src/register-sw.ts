/**
 * Registers the precaching service worker (`public/sw.js`). A new version installs in the
 * background and waits; it takes over at the next app start, before anything renders against
 * it, never mid-session — the running page may still lazy-load chunks only the old cache holds.
 */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      const waiting = registration.waiting;
      if (!waiting || !navigator.serviceWorker.controller) return;
      navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
        once: true,
      });
      waiting.postMessage({ type: "SKIP_WAITING" });
    });
  });
}
