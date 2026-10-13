import { secretsStore } from "@repo/store";
import { useContext, useEffect, useRef } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import {
  type ConnectResult,
  canReleaseOpaquePassword,
  useConnectServer,
} from "./use-connect-server";
import { hasDeviceLogin, reconnectWithDevice, useDeviceLogin } from "./use-device-login";

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
 * expired), using the OPAQUE password kept in memory by the unlock. Without one
 * (e.g. a restored mobile session, or a web biometric unlock, whose device
 * login needs the prompt) the user reconnects by hand.
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

    const epoch = secretsStore.lockEpoch;
    if (reconnectingRef.current || declinedEpoch === epoch) return;
    const opaquePassword = secretsStore.copyOpaquePassword();
    if (!opaquePassword) return;

    reconnectingRef.current = true;
    void connectRef
      .current(opaquePassword)
      .then((result) => {
        noteResult(result, epoch);
        if (canReleaseOpaquePassword(result, storeRef.current.needsBiometricEnroll))
          secretsStore.clearOpaquePassword();
      })
      .finally(() => {
        reconnectingRef.current = false;
      });
  }, [mode, networkOffline]);
}

/**
 * Reattach by hand what `useAutoReconnect` couldn't, e.g. after the
 * two-factor prompt was closed, or after a biometric unlock without the
 * server (then through the biometric prompt again). `canReconnect()`:
 * `offline` with the network up and a way to log in; a call, since that
 * isn't React state (read it when showing the action, e.g. as a menu opens).
 */
export function useReconnect() {
  const { mode, networkOffline } = useContext(SessionContext);
  const { connect, connectWithDevice } = useConnectServer();
  const deviceLogin = useDeviceLogin();
  const store = useStore();
  const canReconnect = () =>
    mode === "offline" &&
    !networkOffline &&
    (secretsStore.hasOpaquePassword || hasDeviceLogin(store.biometricKeyMaterial));

  async function reconnect() {
    const epoch = secretsStore.lockEpoch;
    const opaquePassword = secretsStore.copyOpaquePassword();
    const material = store.biometricKeyMaterial;
    let result: ConnectResult;
    if (opaquePassword) result = await connect(opaquePassword);
    else if (hasDeviceLogin(material))
      result = await reconnectWithDevice(material, deviceLogin, connectWithDevice);
    else return;
    noteResult(result, epoch);
    if (canReleaseOpaquePassword(result, store.needsBiometricEnroll))
      secretsStore.clearOpaquePassword();
  }

  return { canReconnect, reconnect };
}
