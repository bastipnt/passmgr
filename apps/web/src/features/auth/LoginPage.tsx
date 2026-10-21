import {
  removeVaultDescription,
  signInErrorMessage,
  useLogin,
  usePendingChangeCount,
  useSecondFactorRequest,
  useStore,
  useUnlock,
} from "@repo/client";
import { timed } from "@repo/client/src/util/perf";
import { buttonVariants } from "@repo/ui/components/Button";
import { Card, CardContent } from "@repo/ui/components/Card";
import { FieldError } from "@repo/ui/components/Field";
import { LogInIcon, ShieldPlusIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, Redirect } from "wouter";
import { authPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { useStoragePersistent } from "@/hooks/use-storage-persistent";
import AuthCardHeader from "./AuthCardHeader";
import PrivateWindowNote from "./PrivateWindowNote";
import ProfileList from "./ProfileList";
import StepBar from "./StepBar";
import { SignedOutNote } from "./signed-out";
import UnlockCard from "./UnlockCard";

/**
 * Unlock a profile on this device (ADR 0001 D2): the last used one opens as
 * "Unlock passmgr"; "Switch" lists every profile on the device, with the way
 * to log in to another account or create a vault.
 */
export default function LoginPage() {
  const { clearLoginError, clearLoginErrors, loginError } = useLogin();
  // An account with two-factor on: the unlock card asks for the code.
  const secondFactor = useSecondFactorRequest();
  const { unlockLocal, unlockError, clearUnlockError } = useUnlock();

  // "Switch": every profile on the device, instead of the active profile's unlock.
  const [switching, setSwitching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pickFailed, setPickFailed] = useState(false);

  const store = useStore();
  const persistent = useStoragePersistent();
  const pendingChanges = usePendingChangeCount();
  const { active } = store;
  const unlockable = active?.profile && active.accountKeyMaterial ? active.profile : null;
  const unlocking = unlockable !== null && !switching;
  // A vault without an account: it unlocks with the password alone.
  const localVault = unlocking && unlockable.mode === "local";

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

  if (unlocking) {
    return (
      <>
        <PageMeta
          title="Unlock"
          description="Unlock your passmgr vault. Your password never leaves this device."
          canonicalPath={authPaths.login}
        />
        <div className="flex w-full flex-col gap-4 lg:col-span-full lg:mx-auto lg:max-w-md">
          <UnlockCard
            // A picked profile starts over: password closed again if it has biometrics.
            key={active?.entry.profileId}
            email={unlockable.mode === "linked" ? unlockable.email : undefined}
            name={active?.entry.name}
            biometrics={!!store.biometricKeyMaterial}
            onSubmit={onUnlock}
            onSwitch={() => {
              clearErrors();
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
              if (active) void store.removeProfile(active.entry.profileId);
            }}
          />
          {privateWindowNote}
        </div>
      </>
    );
  }

  return (
    <>
      <PageMeta
        title="Switch vault"
        description="Pick a passmgr vault on this device, or log in to another account."
        canonicalPath={authPaths.login}
      />
      <div className="flex w-full flex-col gap-4 lg:col-span-full lg:mx-auto lg:max-w-md">
        <Card variant="glass" flatOnPhone>
          <StepBar onBack={unlockable ? () => setSwitching(false) : undefined} disabled={false} />
          <AuthCardHeader title="Switch vault" />
          <CardContent className="flex flex-col gap-5">
            <SignedOutNote />
            {pickFailed && (
              <FieldError variant="box">
                <strong className="font-semibold">That vault couldn&apos;t be opened.</strong>{" "}
                Please try again.
              </FieldError>
            )}
            <ProfileList
              profiles={store.profiles}
              onPick={(profileId) => void pickProfile(profileId)}
              onRemoveAll={() => void store.removeAllProfiles()}
            />
            <div className="flex flex-col gap-3">
              <Link
                href={authPaths.accountLogin}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                <LogInIcon data-icon="inline-start" />
                Log in to another account
              </Link>
              <Link
                href={authPaths.create}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                <ShieldPlusIcon data-icon="inline-start" />
                Create new vault
              </Link>
            </div>
          </CardContent>
        </Card>
        {privateWindowNote}
      </div>
    </>
  );
}
