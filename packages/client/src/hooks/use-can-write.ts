import { useContext } from "react";
import { SessionContext } from "../providers/SessionProvider";

/**
 * Whether record writes can go through right now. Writes are still
 * server-first, so they need a live server session and a network.
 * TODO(offline-first): drop once the local-first repository + outbox lands;
 * then every unlocked mode can write.
 */
export function useCanWrite(): boolean {
  const { mode, networkOffline } = useContext(SessionContext);
  return mode === "online" && !networkOffline;
}
