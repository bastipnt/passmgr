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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";
import { FieldError } from "@repo/ui/components/Field";
import { EyeOffIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { authPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { useStoragePersistent } from "@/hooks/use-storage-persistent";
import { AuthHero, HeroAccent, HeroChips } from "./AuthHero";
import type { LoginFormValues } from "./LoginForm";
import LoginForm from "./LoginForm";
import PasswordNote from "./PasswordNote";
import ProfileList from "./ProfileList";
import SecondFactorForm from "./SecondFactorForm";
import { SignedOutNote } from "./signed-out";
import UnlockCard from "./UnlockCard";

/**
 * Unlock a profile on this device, or sign in (ADR 0001 D2). The last used
 * profile opens as "Unlock passmgr"; "Switch" shows the email login with every
 * profile on the device listed below it. Signing in with the email of a
 * profile on the device unlocks that profile; another account adds one.
 */
export default function LoginPage() {
  const { loginUser, clearLoginError, clearLoginErrors, loginError } = useLogin();
  // An account with two-factor on: the code step takes the form's place.
  const secondFactor = useSecondFactorRequest();
  const { unlock, unlockLocal, unlockByEmail, unlockError, clearUnlockError } = useUnlock();

  // "Switch": the login with the device's profiles, instead of the active profile's unlock.
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

  const onLogin = async ({ password, email }: LoginFormValues) => {
    setLoading(true);
    try {
      // A profile on this device: unlocked as if picked.
      const unlocked = await timed("total unlock time", () =>
        unlockByEmail(email, password, secondFactor.prompt),
      );
      if (unlocked !== undefined) return;

      // An account new to this device: the server login adds its profile.
      const unlockVaultInfo = await timed("total login time", () =>
        loginUser(email, password, secondFactor.prompt),
      );
      if (!unlockVaultInfo) return;
      await timed("total unlock time", () => unlock(unlockVaultInfo));
    } finally {
      setLoading(false);
    }
  };

  // Stable: the forms subscribe to edits with it.
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

  // Until the profiles are read, nothing tells the unlock from the login apart.
  if (!store.loaded) return null;

  const privateWindowNote = persistent === false && (
    <p
      role="note"
      className="flex items-start justify-center gap-1.5 text-center text-muted-foreground text-xs"
    >
      <EyeOffIcon className="mt-px size-3.5 shrink-0" aria-hidden />
      This browser doesn&apos;t let passmgr store vaults (private window?). A vault created here is
      gone once you lock, reload or close the tab.
    </p>
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
        title="Sign in"
        description="Sign in to your passmgr vault. Zero-knowledge OPAQUE login — your password never leaves this device."
        canonicalPath={authPaths.login}
      />
      <AuthHero
        title={
          <>
            Your secrets, <HeroAccent>seen by no one</HeroAccent> but you.
          </>
        }
        lead="passmgr encrypts your vault on this device before anything leaves it. The server never learns your password — not even once."
      >
        <HeroChips items={["Zero-knowledge", "OPAQUE login", "End-to-end encrypted"]} />
      </AuthHero>

      <div className="flex w-full flex-col gap-4">
        <SignedOutNote />
        {secondFactor.request && (
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Two-factor authentication</CardTitle>
              <CardDescription>Enter the code from your authenticator app.</CardDescription>
            </CardHeader>
            <CardContent>
              <SecondFactorForm
                request={secondFactor.request}
                onSubmit={secondFactor.submit}
                onCancel={secondFactor.cancel}
              />
            </CardContent>
          </Card>
        )}
        {/* Hidden, not unmounted: the typed credentials stay for the unlock that follows. */}
        <div hidden={secondFactor.request !== null}>
          <LoginForm
            footer={<PasswordNote />}
            onSubmit={onLogin}
            error={signInErrorMessage(loginError, unlockError, false)}
            loading={loading}
            onEdit={onEdit}
          />
        </div>

        {privateWindowNote}
        {pickFailed && (
          <FieldError variant="box">
            <strong className="font-semibold">That vault couldn&apos;t be opened.</strong> Please
            try again.
          </FieldError>
        )}
        <ProfileList
          profiles={store.profiles}
          onPick={(profileId) => void pickProfile(profileId)}
          onRemoveAll={() => void store.removeAllProfiles()}
        />
      </div>
    </>
  );
}
