import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";

type RouteParams = Record<string, string | undefined>;

/**
 * Drives an overlay from the URL: the route is the single source of truth for
 * whether the sheet is open, and closing it is a navigation.
 *
 * The local `open` mirror exists for the exit animation. Navigating away the
 * instant the user dismisses would unmatch the route mid-animation, and any
 * content derived from the route params would blank out while the sheet is
 * still sliding off screen. So: dismiss flips `open`, the animation runs
 * against the last matched params, and only `onOpenChangeComplete` commits the
 * route change.
 *
 * @param pattern wouter path pattern, from `@/app/route-paths`
 * @param closeTo where to navigate once the exit animation has finished
 */
export function useRouteSheet<T extends RouteParams>(
  pattern: string,
  closeTo: (params: T) => string,
) {
  // `useRoute`'s generic resolves to a conditional type that won't narrow to
  // the caller's `T`, so the pattern's params are asserted here instead.
  const [match, matchedParams] = useRoute(pattern);
  const params = matchedParams as T | undefined;
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(match);

  // Last params that matched, kept so the sheet can render its outgoing
  // content through the exit animation.
  const lastParams = useRef(params);
  if (params) lastParams.current = params;

  useEffect(() => {
    setOpen(match);
  }, [match]);

  return {
    open,
    params: lastParams.current,
    setOpen,
    onOpenChangeComplete: (nextOpen: boolean) => {
      if (nextOpen || !match || !lastParams.current) return;
      navigate(closeTo(lastParams.current), { replace: true });
    },
  };
}
