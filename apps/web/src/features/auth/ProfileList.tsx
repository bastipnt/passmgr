import { profileLabel, unsyncedChangesWarning, useStore } from "@repo/client";
import type { ProfileEntry } from "@repo/store";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { ChevronRightIcon, HardDriveIcon, TrashIcon } from "lucide-react";
import { useState } from "react";

type ProfileListProps = {
  profiles: readonly ProfileEntry[];
  /** Open this profile's unlock. */
  onPick: (profileId: string) => void;
  /** Remove every profile from this device (after the dialog confirmed it). */
  onRemoveAll: () => void;
};

/**
 * Under the login card: the profiles on this device (ADR 0001 D2), each one
 * a shortcut to its unlock, and a way to remove them all.
 */
export default function ProfileList({ profiles, onPick, onRemoveAll }: ProfileListProps) {
  if (profiles.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label="Vaults on this device" className="flex flex-col gap-2">
        {profiles.map((profile) => (
          <li key={profile.profileId}>
            <ProfileButton profile={profile} onPick={() => onPick(profile.profileId)} />
          </li>
        ))}
      </ul>
      <RemoveAllButton profiles={profiles} onRemoveAll={onRemoveAll} />
    </div>
  );
}

function ProfileButton({ profile, onPick }: { profile: ProfileEntry; onPick: () => void }) {
  const label = profileLabel(profile);
  return (
    <button
      type="button"
      onClick={onPick}
      className="glass flex w-full cursor-pointer items-center gap-3 rounded-2xl p-3 text-left outline-none transition-colors hover:bg-white/70 focus-visible:ring-4 focus-visible:ring-ring/25 dark:hover:bg-white/10"
    >
      {profile.mode === "linked" ? <AccountAvatar email={label} /> : <LocalVaultAvatar />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-sm">{label}</span>
        <span className="text-muted-foreground text-xs">
          {profile.mode === "linked" ? "Unlock existing vault" : "No account · not synced"}
        </span>
      </span>
      <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
    </button>
  );
}

/**
 * Its warning counts what is lost for good: vaults without an account (the
 * only copy) and changes that never synced. Counted when the dialog opens.
 */
function RemoveAllButton({
  profiles,
  onRemoveAll,
}: {
  profiles: readonly ProfileEntry[];
  onRemoveAll: () => void;
}) {
  const { countPendingChanges } = useStore();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<number>();

  async function openDialog() {
    setPending(undefined);
    setOpen(true);
    const linked = profiles.filter((p) => p.mode === "linked");
    try {
      const counts = await Promise.all(linked.map((p) => countPendingChanges(p.profileId)));
      setPending(counts.reduce((sum, n) => sum + n, 0));
    } catch (e) {
      console.error("Counting unsynced changes failed", e);
    }
  }

  const local = profiles.filter((p) => p.mode === "local").length;
  const description = [
    `This deletes ${profiles.length === 1 ? "the vault" : `all ${profiles.length} vaults`} from this device. Accounts and their data on the server are not affected.`,
    local > 0 &&
      (local === 1
        ? " One vault has no account: this is its only copy, everything in it is lost for good."
        : ` ${local} vaults have no account: these are their only copies, everything in them is lost for good.`),
    unsyncedChangesWarning(pending),
  ]
    .filter(Boolean)
    .join("");

  return (
    <>
      <button
        type="button"
        onClick={() => void openDialog()}
        className="mx-auto flex cursor-pointer items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground"
      >
        <TrashIcon className="size-3.5" aria-hidden />
        Remove all vaults from this device
      </button>
      <RemoveDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove all vaults"
        description={description}
        removeTitle="Remove all"
        onRemove={() => {
          setOpen(false);
          onRemoveAll();
        }}
      />
    </>
  );
}

export function AccountAvatar({ email }: { email: string }) {
  return (
    <span
      aria-hidden
      className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary font-bold font-display text-lg text-primary-foreground"
    >
      {email.charAt(0).toUpperCase()}
    </span>
  );
}

export function LocalVaultAvatar() {
  return (
    <span
      aria-hidden
      className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
    >
      <HardDriveIcon className="size-5" />
    </span>
  );
}
