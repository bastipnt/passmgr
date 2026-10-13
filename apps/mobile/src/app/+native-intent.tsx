import { sharedWebsite } from "@repo/client";
import * as Linking from "expo-linking";
import { routeSharedLogin } from "@/features/records/shared-login";
import { recordPaths } from "@/route-paths";

/** The iOS share extension and Android's `ShareActivity` open `passmgr://share?text=…`. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const { hostname, path: route, queryParams } = Linking.parse(path);
  if (hostname !== "share" && route !== "share") return path;

  const text = queryParams?.text;
  return routeSharedLogin(
    recordPaths.createLogin(typeof text === "string" ? sharedWebsite(text) : undefined),
  ) as string;
}
