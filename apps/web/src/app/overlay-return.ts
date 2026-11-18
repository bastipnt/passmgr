import { useEffect } from "react";
import { usePageLocation } from "./page-transitions";
import { authPaths, passMonitorPaths, recordPaths, settingsPaths } from "./route-paths";

const authPathnames = new Set<string>(Object.values(authPaths).map((path) => path.split("?")[0]));
const overlayRoots: string[] = [settingsPaths.index, passMonitorPaths.index];

let returnTo: string = recordPaths.index;

const inOverlay = (path: string) =>
  overlayRoots.some((root) => path === root || path.startsWith(`${root}/`));

/**
 * Where closing an overlay (settings, Pass Monitor) leads: the last screen seen
 * outside the overlays and auth, else the vault list.
 */
export function overlayReturnPath() {
  return returnTo;
}

// A record's sheets (edit, history) and the query's one-shot requests (create, generate) aren't
// screens to come back to: the record, or the list, is.
const recordSheet = /^(\/record\/[^/]+)\/.+$/;

export function rememberOverlayReturn(path: string) {
  if (inOverlay(path) || authPathnames.has(path)) return;
  returnTo = path.replace(recordSheet, "$1");
}

/** Keeps `overlayReturnPath` current. Render once, next to the routes: a leaf, so a navigation re-renders only it. */
export function OverlayReturnTracker() {
  const [path] = usePageLocation();
  useEffect(() => rememberOverlayReturn(path), [path]);
  return null;
}
