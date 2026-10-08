import {
  unsyncedChangesWarning,
  useLogin,
  usePendingChangeCount,
  useStore,
  useUnlock,
} from "@repo/client";
import { timed } from "@repo/client/src/util/perf";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { FieldError } from "@repo/ui/components/Field";
import { EyeOffIcon, ShieldCheckIcon, TrashIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { authPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { useStoragePersistent } from "@/hooks/use-storage-persistent";
import { AuthHero, HeroAccent, HeroChips } from "./AuthHero";
import { BiometricUnlockButton } from "./BiometricUnlockButton";
import type { LoginFormValues } from "./LoginForm";
import LoginForm from "./LoginForm";
import ProfileList from "./ProfileList";
import StoredAccountRow from "./StoredAccountRow";

/**
 * Unlock a profile on this device, or sign in (ADR 0001 D2). The last used
 * profile opens as an unlock card; "Switch" shows the email login with every
 * profile on the device listed below it. Signing in with the email of a
 * profile on the device unlocks that profile; another account adds one.
 */
export default function LoginPage() {
  const { loginUser, clearLoginError, clearLoginErrors, loginError, loginThrottled } = useLogin();
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
  const storedEmail = unlocking && unlockable.mode === "linked" ? unlockable.email : undefined;

  const onSubmit = async ({ password, email }: LoginFormValues) => {
    setLoading(true);
    try {
      // The active profile: unlock it locally, the server session follows.
      if (unlocking) {
        await timed("total unlock time", () => unlockLocal(password));
        return;
      }

      // A profile on this device: unlocked as if picked.
      const unlocked = await timed("total unlock time", () => unlockByEmail(email, password));
      if (unlocked !== undefined) return;

      // An account new to this device: the server login adds its profile.
      const unlockVaultInfo = await timed("total login time", () => loginUser(email, password));
      if (!unlockVaultInfo) return;
      await timed("total unlock time", () => unlock(unlockVaultInfo));
    } finally {
      setLoading(false);
    }
  };

  // Stable: `LoginForm` subscribes to edits with it.
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

  return (
    <>
      <PageMeta
        title="Sign in"
        description="Sign in to your passmgr vault. Zero-knowledge OPAQUE login — your password never leaves this device."
        canonicalPath={authPaths.login}
      />
      {unlocking ? (
        <AuthHero
          title={
            <>
              Your vault is locked. <HeroAccent>Only you hold the key.</HeroAccent>
            </>
          }
          lead="Your encrypted vault is stored on this device. Unlock it with your password or biometrics — nothing is decrypted on the server."
        />
      ) : (
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
      )}

      <div className="flex w-full flex-col gap-4">
        <LoginForm
          localVault={localVault}
          storedEmail={unlocking ? storedEmail : undefined}
          account={
            unlocking && (
              <StoredAccountRow
                email={storedEmail}
                name={active?.entry.name}
                onSwitch={() => {
                  clearErrors();
                  setSwitching(true);
                }}
              />
            )
          }
          alternative={
            unlocking &&
            store.biometricKeyMaterial && (
              <BiometricUnlockButton loading={loading} setLoading={setLoading} />
            )
          }
          footer={
            unlocking ? (
              <RemoveDialog
                title="Remove vault"
                description={
                  localVault
                    ? "This deletes the vault from this device. It has no account, so this is its only copy: everything in it is lost for good."
                    : `This will remove the local vault data from this device. Your account and server data are not affected. You can log in again with your credentials.${unsyncedChangesWarning(pendingChanges)}`
                }
                removeTitle="Remove vault"
                onRemove={() => {
                  // Locked here: nothing to lock or sign out first.
                  if (active) void store.removeProfile(active.entry.profileId);
                }}
              >
                <button
                  type="button"
                  className="mx-auto flex cursor-pointer items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground"
                >
                  <TrashIcon className="size-3.5" aria-hidden />
                  Remove vault from this device
                </button>
              </RemoveDialog>
            ) : (
              <p className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs">
                <ShieldCheckIcon className="size-3.5" aria-hidden />
                Your password never leaves this device
              </p>
            )
          }
          onSubmit={onSubmit}
          loginError={loginError}
          loginThrottled={loginThrottled}
          unlockError={unlockError}
          loading={loading}
          onEdit={onEdit}
        />

        {persistent === false && (
          <p
            role="note"
            className="flex items-start justify-center gap-1.5 text-center text-muted-foreground text-xs"
          >
            <EyeOffIcon className="mt-px size-3.5 shrink-0" aria-hidden />
            This browser doesn&apos;t let passmgr store vaults (private window?). A vault created
            here is gone once you lock, reload or close the tab.
          </p>
        )}
        {!unlocking && pickFailed && (
          <FieldError variant="box">
            <strong className="font-semibold">That vault couldn&apos;t be opened.</strong> Please
            try again.
          </FieldError>
        )}
        {!unlocking && (
          <ProfileList
            profiles={store.profiles}
            onPick={(profileId) => void pickProfile(profileId)}
            onRemoveAll={() => void store.removeAllProfiles()}
          />
        )}
      </div>
    </>
  );
}
