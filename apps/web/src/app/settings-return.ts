import { useEffect } from "react";
import { usePageLocation, usePageSearch } from "./page-transitions";
import { authPaths, recordPaths, settingsPaths } from "./route-paths";

const authPathnames = new Set<string>(Object.values(authPaths).map((path) => path.split("?")[0]));

let returnTo: string = recordPaths.index;

const inSettings = (path: string) =>
  path === settingsPaths.index || path.startsWith(`${settingsPaths.index}/`);

/** Where closing settings leads: the last screen seen outside settings and auth, else the vault list. */
export function settingsReturnPath() {
  return returnTo;
}

export function rememberSettingsReturn(path: string, search: string) {
  if (inSettings(path) || authPathnames.has(path)) return;
  returnTo = path + search;
}

/** Keeps `settingsReturnPath` current. Render once, next to the routes: a leaf, so a navigation re-renders only it. */
export function SettingsReturnTracker() {
  const [path] = usePageLocation();
  const search = usePageSearch();
  useEffect(() => rememberSettingsReturn(path, search), [path, search]);
  return null;
}
