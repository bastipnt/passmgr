import { SessionContext, useAutoReconnect, useLinkDeviceCredential } from "@repo/client";
import { type ReactNode, useContext } from "react";
import { Redirect } from "wouter";
import { authPaths } from "@/app/route-paths";

/** The screens of an unlocked vault: keeps the session connected; locked, they go to the welcome. */
export function RequireUnlocked({ children }: { children: ReactNode }) {
  const { vaultUnlocked } = useContext(SessionContext);
  useAutoReconnect();
  useLinkDeviceCredential();

  // The welcome sends a device with vaults on to their unlock.
  if (!vaultUnlocked) return <Redirect to={authPaths.welcome} />;
  return children;
}
