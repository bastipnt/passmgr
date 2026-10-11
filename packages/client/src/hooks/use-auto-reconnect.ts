import { secretsStore } from "@repo/store";
import { useContext, useEffect, useRef } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { type ConnectResult, canReleasePassword, useConnectServer } from "./use-connect-server";

// The lock epoch of the unlock whose two-factor prompt the user closed: the
// automatic reconnect doesn't ask again for it (a network flap would pop the
// prompt up unasked); `useReconnect` still can. App-wide, like the connect.
let declinedEpoch: number | null = null;

function noteResult(result: ConnectResult, epoch: number) {
  if (result === "second_factor") declinedEpoch = epoch;
  else if (result === "online") declinedEpoch = null;
}

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
    const epoch = secretsStore.lockEpoch;
    if (!password || reconnectingRef.current || declinedEpoch === epoch) return;

    reconnectingRef.current = true;
    void connectRef
      .current(password)
      .then((result) => {
        noteResult(result, epoch);
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

/**
 * Reattach by hand what `useAutoReconnect` couldn't, e.g. after the
 * two-factor prompt was closed. `canReconnect()`: `offline` with the network
 * up and the unlock's password still in memory; a call, since that password
 * isn't React state (read it when showing the action, e.g. as a menu opens).
 */
export function useReconnect() {
  const { mode, networkOffline } = useContext(SessionContext);
  const { connect } = useConnectServer();
  const store = useStore();
  const canReconnect = () =>
    mode === "offline" && !networkOffline && secretsStore.getPassword() !== undefined;

  async function reconnect() {
    const password = secretsStore.getPassword();
    if (!password) return;
    const epoch = secretsStore.lockEpoch;
    const result = await connect(password);
    noteResult(result, epoch);
    if (canReleasePassword(result, store.needsBiometricEnroll)) secretsStore.clearPassword();
  }

  return { canReconnect, reconnect };
}
