import { useEffect, useRef, useState } from "react";

type DiscardGuardOptions = {
  /** Whether the URL has the sheet open. */
  routeOpen: boolean;
  /** The sheet's own open state, when it closes before its route does (exit animation first). */
  shown?: boolean;
  isDirty: () => boolean;
  /** Puts the sheet's URL back: Keep editing after the browser's Back. */
  reopen: () => void;
};

export type DiscardGuard = {
  /** Whether the sheet is up: also while the question holds it open after Back. */
  open: boolean;
  /** Runs `close` at once, or after Discard when there are unsaved changes. */
  requestClose: (close: () => void) => void;
  /** Lets the next route close through without asking (a save that navigates). */
  allowClose: () => void;
  confirm: { open: boolean; onDiscard: () => void; onKeepEditing: () => void };
};

/**
 * Asks "Discard changes?" before a route-driven sheet with unsaved changes closes. A close from
 * the sheet goes through `requestClose`; Back has already left the URL, so the sheet is held open.
 */
export function useDiscardGuard({
  routeOpen,
  shown: ownShown,
  isDirty,
  reopen,
}: DiscardGuardOptions): DiscardGuard {
  // Follows the route a commit late, so the render where Back lands still has the sheet up.
  const [routeShown, setRouteShown] = useState(routeOpen);
  const shown = ownShown ?? routeShown;
  const [held, setHeld] = useState(false);
  const [pendingClose, setPendingClose] = useState<(() => void) | null>(null);
  const closing = useRef(false);
  const lastRouteOpen = useRef(routeOpen);

  useEffect(() => {
    if (lastRouteOpen.current === routeOpen) return;
    lastRouteOpen.current = routeOpen;
    setRouteShown(routeOpen);
    if (routeOpen) {
      setHeld(false);
      return;
    }
    if (shown && !closing.current && isDirty()) {
      setHeld(true);
      setPendingClose(() => () => setHeld(false));
    }
    closing.current = false;
  });

  const approve = (close: () => void) => () => {
    closing.current = true;
    close();
  };

  return {
    open: shown || held,
    requestClose: (close) => {
      if (isDirty()) setPendingClose(() => approve(close));
      else approve(close)();
    },
    allowClose: () => {
      closing.current = true;
    },
    confirm: {
      open: pendingClose !== null,
      onDiscard: () => {
        setPendingClose(null);
        pendingClose?.();
      },
      onKeepEditing: () => {
        setPendingClose(null);
        if (held) reopen();
      },
    },
  };
}
