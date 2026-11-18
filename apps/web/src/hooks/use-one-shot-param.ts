import { useEffect, useState } from "react";
import { useSearchParams } from "wouter";

/**
 * A query flag asking for something once (open a dialog): true if the URL had it
 * on mount. It is dropped from the URL right away, so a reload or Back doesn't ask again.
 */
export function useOneShotParam(name: string): boolean {
  const [searchParams, setSearchParams] = useSearchParams();
  const [requested] = useState(() => searchParams.has(name));

  useEffect(() => {
    if (!searchParams.has(name)) return;
    const next = new URLSearchParams(searchParams);
    next.delete(name);
    setSearchParams(next, { replace: true });
  }, [name, searchParams, setSearchParams]);

  return requested;
}
