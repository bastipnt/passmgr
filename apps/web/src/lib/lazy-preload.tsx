import { type ComponentProps, type ComponentType, lazy, useState } from "react";

type Loader = () => Promise<unknown>;

const loaders = new Set<Loader>();

/**
 * `React.lazy` that `preloadAll` can fetch ahead of time. A component whose module is already
 * loaded renders directly, without the Suspense round trip `lazy` takes on first render.
 */
// oxlint-disable-next-line typescript/no-explicit-any -- matches React.lazy's own constraint
export function lazyPreload<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  let loaded: T | undefined;
  let pending: Promise<{ default: T }> | undefined;
  const preload = () =>
    (pending ??= load().then(
      (module) => {
        loaded = module.default;
        return module;
      },
      (error: unknown) => {
        pending = undefined; // a failed fetch may succeed later
        throw error;
      },
    ));
  const Lazy = lazy(preload);
  loaders.add(preload);

  function Preloadable(props: ComponentProps<T>) {
    // Fixed per mount: switching from `Lazy` to the loaded type would remount it.
    const [{ Component }] = useState(() => ({
      Component: (loaded ?? Lazy) as ComponentType<ComponentProps<T>>,
    }));
    return <Component {...props} />;
  }
  return Preloadable;
}

/**
 * Loads every `lazyPreload` module, including the ones registered by modules loaded on the
 * way (a feature's own lazy pages), so later navigation never waits on a chunk.
 */
async function preloadAll() {
  const done = new Set<Loader>();
  while (done.size < loaders.size) {
    const batch = [...loaders].filter((loader) => !done.has(loader));
    for (const loader of batch) done.add(loader);
    await Promise.allSettled(batch.map((loader) => loader()));
  }
}

const SW_READY_TIMEOUT_MS = 15_000;

/**
 * `preloadAll` once the service worker has precached the build (it downloads every chunk anyway,
 * `public/sw.js`), so the chunks come from there instead of competing with the first load.
 * Skipped with Save-Data on: a chunk then loads when its page opens.
 */
export function preloadAllWhenIdle() {
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) {
    return;
  }
  const run = () => void preloadAll();
  const whenIdle = () => {
    if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 5000 });
    else setTimeout(run, 2000);
  };
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    // `ready` never settles where registering fails (some private windows): don't wait forever.
    const timeout = new Promise((resolve) => setTimeout(resolve, SW_READY_TIMEOUT_MS));
    void Promise.race([navigator.serviceWorker.ready, timeout]).then(whenIdle);
  } else {
    whenIdle();
  }
}
