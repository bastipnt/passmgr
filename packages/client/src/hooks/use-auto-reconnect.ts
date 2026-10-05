import { secretsStore } from "@repo/store";
import { useContext, useEffect, useRef } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { canReleasePassword, useConnectServer } from "./use-connect-server";

/**
 * Reattach server auth while a linked vault is unlocked `offline` and the
 * network is up (after an unlock without the server, or once a session
 * expired), using the password kept in memory by the unlock. Without one
 * (e.g. a restored mobile session) the user reconnects by hand.
 */
export function useAutoReconnect() {
  const { mode, networkOffline } = useContext(SessionContext);
  const { connect } = useConnectServer();
  const store = useStore();
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const storeRef = useRef(store);
  storeRef.current = store;
  const reconnectingRef = useRef(false);

  useEffect(() => {
    if (mode !== "offline" || networkOffline) return;

    const password = secretsStore.getPassword();
    if (!password || reconnectingRef.current) return;

    reconnectingRef.current = true;
    void connectRef
      .current(password)
      .then((result) => {
        // Drop the password once it got us online or never will (unless
        // biometric enrollment still needs it).
        if (canReleasePassword(result, storeRef.current.needsBiometricEnroll))
          secretsStore.clearPassword();
      })
      .finally(() => {
        reconnectingRef.current = false;
      });
  }, [mode, networkOffline]);
}
