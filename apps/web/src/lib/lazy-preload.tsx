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
export async function preloadAll() {
  const done = new Set<Loader>();
  while (done.size < loaders.size) {
    const batch = [...loaders].filter((loader) => !done.has(loader));
    for (const loader of batch) done.add(loader);
    await Promise.allSettled(batch.map((loader) => loader()));
  }
}

/** `preloadAll` once the browser is idle after the first render. */
export function preloadAllWhenIdle() {
  const run = () => void preloadAll();
  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 2000);
}
