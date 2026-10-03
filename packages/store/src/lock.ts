/** Runs `fn` once every previously queued task has settled (FIFO). */
export type Lock = <T>(fn: () => Promise<T>) => Promise<T>;

/** A minimal async mutex. A rejected task doesn't block the ones queued after it. */
export function createLock(): Lock {
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(fn: () => Promise<T>): Promise<T> => {
    const result = tail.then(fn);
    tail = result.catch(() => undefined);
    return result;
  };
}
