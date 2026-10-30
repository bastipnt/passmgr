import { toast } from "@repo/ui";

const UPDATE_TOAST_ID = "app-update";

/**
 * Registers the precaching service worker (`public/sw.js`). A new version installs in the
 * background and waits; it never takes over mid-session on its own — the running page may still
 * lazy-load chunks only the old cache holds. It takes over at the next app start, or earlier when
 * the user picks "Reload" on the update toast.
 */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      watchForUpdates(registration);
    });
  });
}

/**
 * A version already waiting at startup takes over right away (one reload, before anything is in
 * use). One that finishes installing later, usually the release this visit's update check found,
 * is offered with `onUpdateReady`. So is a version another tab activated: this page is then
 * controlled by a worker whose cache lacks its lazy chunks, and should reload too.
 */
export function watchForUpdates(
  registration: ServiceWorkerRegistration,
  onUpdateReady: (reload: () => void) => void = showUpdateToast,
) {
  const sw = navigator.serviceWorker;
  // First install: there's no older version to update from.
  if (!sw.controller) return;

  let takingOver = false;
  const activate = (worker: ServiceWorker) => {
    takingOver = true;
    worker.postMessage({ type: "SKIP_WAITING" });
  };
  sw.addEventListener("controllerchange", () => {
    if (takingOver) window.location.reload();
    else onUpdateReady(() => window.location.reload());
  });

  if (registration.waiting) {
    activate(registration.waiting);
    return;
  }

  const offerWhenInstalled = (worker: ServiceWorker) => {
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed") onUpdateReady(() => activate(worker));
    });
  };
  if (registration.installing) offerWhenInstalled(registration.installing);
  registration.addEventListener("updatefound", () => {
    if (registration.installing) offerWhenInstalled(registration.installing);
  });
}

function showUpdateToast(reload: () => void) {
  toast("New version available", {
    id: UPDATE_TOAST_ID,
    description: "Reload to update. Reloading locks your vault.",
    duration: Number.POSITIVE_INFINITY,
    action: { label: "Reload", onClick: reload },
    cancel: { label: "Later", onClick: () => {} },
  });
}
