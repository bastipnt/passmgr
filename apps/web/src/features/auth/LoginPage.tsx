import {
  profileHue,
  removeVaultDescription,
  signInErrorMessage,
  useLogin,
  usePendingChangeCount,
  useSecondFactorRequest,
  useStore,
  useUnlock,
} from "@repo/client";
import { timed } from "@repo/client/src/util/perf";
import { useCallback, useState } from "react";
import { Redirect } from "wouter";
import { authPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { useStoragePersistent } from "@/hooks/use-storage-persistent";
import PrivateWindowNote from "./PrivateWindowNote";
import SwitchVaultSheet from "./SwitchVaultSheet";
import UnlockCard from "./UnlockCard";

/**
 * Unlock a profile on this device (ADR 0001 D2): the last used one opens as
 * "Unlock passmgr"; "Switch" opens a sheet with every profile on the device
 * (`SwitchVaultSheet`), open by itself while none can be unlocked.
 */
export default function LoginPage() {
  const { clearLoginError, clearLoginErrors, loginError } = useLogin();
  // An account with two-factor on: the unlock card asks for the code.
  const secondFactor = useSecondFactorRequest();
  const { unlockLocal, unlockError, clearUnlockError } = useUnlock();

  const [switching, setSwitching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pickFailed, setPickFailed] = useState(false);

  const store = useStore();
  const persistent = useStoragePersistent();
  const pendingChanges = usePendingChangeCount();
  const { active } = store;
  const unlockable = active?.profile && active.accountKeyMaterial ? active.profile : null;
  // A vault without an account: it unlocks with the password alone.
  const localVault = unlockable?.mode === "local";

  const onUnlock = async (password: string) => {
    setLoading(true);
    try {
      await timed("total unlock time", () => unlockLocal(password, secondFactor.prompt));
    } finally {
      setLoading(false);
    }
  };

  // Stable: the form subscribes to edits with it.
  const onEdit = useCallback(() => {
    clearLoginError();
    clearUnlockError();
  }, [clearLoginError, clearUnlockError]);

  function clearErrors() {
    // Another account: the throttle warning no longer applies either.
    clearLoginErrors();
    clearUnlockError();
  }

  async function pickProfile(profileId: string) {
    clearErrors();
    setPickFailed(false);
    try {
      await store.selectProfile(profileId);
      setSwitching(false);
    } catch (e) {
      console.error("Opening the profile failed", e);
      setPickFailed(true);
    }
  }

  if (!store.loaded) return null;
  if (store.profiles.length === 0) return <Redirect to={authPaths.welcome} replace />;

  const privateWindowNote = persistent === false && (
    <PrivateWindowNote>
      This browser doesn&apos;t let passmgr store vaults (private window?). A vault created here is
      gone once you lock, reload or close the tab.
    </PrivateWindowNote>
  );

  return (
    <>
      <PageMeta
        title="Unlock"
        description="Unlock your passmgr vault. Your password never leaves this device."
        canonicalPath={authPaths.login}
      />
      <div className="flex w-full flex-col gap-4 sm:col-span-full sm:mx-auto sm:max-w-md">
        {unlockable && active && (
          <UnlockCard
            // A picked profile starts over: password closed again if it has biometrics.
            key={active.entry.profileId}
            email={unlockable.mode === "linked" ? unlockable.email : undefined}
            name={active.entry.name}
            hue={profileHue(active.entry)}
            biometrics={!!store.biometricKeyMaterial}
            onSubmit={onUnlock}
            onSwitch={() => {
              clearErrors();
              setPickFailed(false);
              setSwitching(true);
            }}
            error={signInErrorMessage(loginError, unlockError, localVault)}
            loading={loading}
            setLoading={setLoading}
            onEdit={onEdit}
            secondFactor={secondFactor}
            removeDescription={removeVaultDescription(!localVault, pendingChanges)}
            onRemove={() => {
              // Locked here: nothing to lock or sign out first.
              void store.removeProfile(active.entry.profileId);
            }}
          />
        )}
        {/*
          Always mounted, and open while nothing can be unlocked: removing the active
          profile leaves none active until the next one opens, and that must not
          close the sheet or a dialog open in it.
        */}
        <SwitchVaultSheet
          open={switching || !unlockable}
          onOpenChange={setSwitching}
          onPick={(profileId) => void pickProfile(profileId)}
          pickFailed={pickFailed}
        />
        {privateWindowNote}
      </div>
    </>
  );
}
