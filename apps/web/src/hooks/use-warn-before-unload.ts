import { useEffect } from "react";

/** While `active`, closing or reloading the tab asks first, e.g. while a recovery key is shown once. */
export function useWarnBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}
