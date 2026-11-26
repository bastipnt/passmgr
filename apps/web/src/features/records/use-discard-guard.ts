import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { latestNavigation, undoNavigation } from "@/app/page-transitions";

type DiscardGuardOptions = {
  /** Whether the URL has the sheet open. */
  routeOpen: boolean;
  /** The sheet's own open state, when it closes before its route does (exit animation first). */
  shown?: boolean;
  isDirty: () => boolean;
  /** `history.state` for the sheet's URL, when Keep editing has to put it back in place. */
  reopenState?: () => unknown;
};

export type DiscardGuard = {
  /** Whether the sheet is up: also while the question holds it open after Back. */
  open: boolean;
  /** Runs `close` at once, or after Discard when there are unsaved changes. */
  requestClose: (close: () => void) => void;
  /** Runs `discard` (a step inside the open sheet that drops the form) at once, or after Discard. */
  requestDiscard: (discard: () => void) => void;
  /** Lets the next route close through without asking (a save that navigates), and lets a held
   * sheet go, question and all (its record is gone). */
  allowClose: () => void;
  confirm: { open: boolean; onDiscard: () => void; onKeepEditing: () => void };
};

/**
 * Back has already left the URL when it closes a changed sheet, so the sheet is held open until the
 * question is answered (flow: apps/web/CLAUDE.md, Record form).
 */
export function useDiscardGuard({
  routeOpen,
  shown: ownShown,
  isDirty,
  reopenState,
}: DiscardGuardOptions): DiscardGuard {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const href = useRef("");
  if (routeOpen) href.current = search ? `${location}?${search}` : location;
  // Follows the route a commit late, so the render where Back lands still has the sheet up.
  const [routeShown, setRouteShown] = useState(routeOpen);
  const shown = ownShown ?? routeShown;
  const [held, setHeld] = useState(false);
  const [pendingClose, setPendingClose] = useState<(() => void) | null>(null);
  const closing = useRef(false);
  const heldAt = useRef(0);
  const lastRouteOpen = useRef(routeOpen);

  useEffect(() => {
    if (lastRouteOpen.current === routeOpen) return;
    lastRouteOpen.current = routeOpen;
    setRouteShown(routeOpen);
    if (routeOpen) {
      setHeld(false);
      closing.current = false;
      return;
    }
    if (shown && !closing.current && isDirty()) {
      setHeld(true);
      heldAt.current = latestNavigation();
      setPendingClose(() => () => setHeld(false));
    }
    closing.current = false;
  });

  const ask = (action: () => void) => {
    if (isDirty()) setPendingClose(() => action);
    else action();
  };
  const approve = (close: () => void) => () => {
    closing.current = true;
    close();
  };

  return {
    open: shown || held,
    requestClose: (close) => ask(approve(close)),
    requestDiscard: ask,
    allowClose: () => {
      // A held sheet's route is already gone: no route change will come to clear the flag.
      if (routeOpen) closing.current = true;
      setHeld(false);
      setPendingClose(null);
    },
    confirm: {
      open: pendingClose !== null,
      onDiscard: () => {
        setPendingClose(null);
        pendingClose?.();
      },
      onKeepEditing: () => {
        setPendingClose(null);
        if (!held) return;
        undoNavigation(
          () => navigate(href.current, { replace: true, state: reopenState?.() }),
          heldAt.current,
        );
      },
    },
  };
}
