import { useState, useSyncExternalStore } from "react";

function createRevision() {
  let revision = 0;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    read: () => revision,
    bump: () => {
      revision++;
      for (const listener of listeners) listener();
    },
  };
}

/**
 * A counter for data kept outside React state (refs, synchronous storage): `bump` re-renders
 * the caller and changes `revision`, for the data's readers to key on.
 */
export function useRevision(): { revision: number; bump: () => void } {
  const [store] = useState(createRevision);
  const revision = useSyncExternalStore(store.subscribe, store.read);
  return { revision, bump: store.bump };
}
