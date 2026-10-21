import {
  profileDetail,
  profileHue,
  profileLabel,
  removeVaultDescription,
  removeVaultsDescription,
  useProfilesPendingChanges,
  useStore,
} from "@repo/client";
import type { ProfileEntry } from "@repo/store";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { ResponsiveSheet, SheetDrawerHeader } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { FieldError } from "@repo/ui/components/Field";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import { LogInIcon, type LucideIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { authPaths } from "@/app/route-paths";
import ProfileAvatar from "./ProfileAvatar";

const TITLE = "Switch vault";
const DESCRIPTION = "Vaults on this device, last opened first.";

type SwitchVaultListProps = {
  onPick: (profileId: string) => void;
  pickFailed: boolean;
};

type SwitchVaultSheetProps = SwitchVaultListProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** "Switch vault" over the unlock: every profile on this device (ADR 0001 D2). */
export default function SwitchVaultSheet({
  open,
  onOpenChange,
  ...listProps
}: SwitchVaultSheetProps) {
  const isMobile = useIsMobile();

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={TITLE}
      description={DESCRIPTION}
      actions={
        isMobile ? (
          <SheetDrawerHeader title={TITLE} description={DESCRIPTION} />
        ) : (
          <RemoveAllButton />
        )
      }
    >
      <div className="flex flex-col gap-6 px-4 sm:px-5 sm:py-4">
        <SwitchVaultList {...listProps} />
        {isMobile && <RemoveAllButton />}
      </div>
    </ResponsiveSheet>
  );
}

function SwitchVaultList({ onPick, pickFailed }: SwitchVaultListProps) {
  const { profiles } = useStore();

  return (
    <div className="flex flex-col gap-6">
      {pickFailed && (
        <FieldError variant="box">
          <strong className="font-semibold">That vault couldn&apos;t be opened.</strong> Please try
          again.
        </FieldError>
      )}
      <ul aria-label="Vaults on this device" className="-mx-2 flex flex-col gap-1">
        {profiles.map((profile) => (
          <ProfileRow
            key={profile.profileId}
            profile={profile}
            onPick={() => onPick(profile.profileId)}
          />
        ))}
      </ul>
      <section aria-labelledby="switch-vault-add" className="-mx-2 flex flex-col gap-1">
        <h3
          id="switch-vault-add"
          className="px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider"
        >
          Add
        </h3>
        <AddLink href={authPaths.accountLogin} icon={LogInIcon}>
          Log in to another account
        </AddLink>
        <AddLink href={authPaths.create} icon={PlusIcon}>
          Create new vault
        </AddLink>
      </section>
    </div>
  );
}

const ROW = "flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-primary/6";
const ROW_FOCUS = "outline-none focus-visible:ring-4 focus-visible:ring-ring/25";

function ProfileRow({ profile, onPick }: { profile: ProfileEntry; onPick: () => void }) {
  const { removeProfile } = useStore();
  const { pending, count } = useProfilesPendingChanges();
  const [confirming, setConfirming] = useState(false);
  const label = profileLabel(profile);
  const linked = profile.mode === "linked";

  return (
    <li className={ROW}>
      <button
        type="button"
        onClick={onPick}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl text-left",
          ROW_FOCUS,
        )}
      >
        <ProfileAvatar email={linked ? label : undefined} hue={profileHue(profile)} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-semibold text-[0.95rem]">{label}</span>
          <span className="truncate text-muted-foreground text-xs">{profileDetail(profile)}</span>
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive max-sm:size-12"
        title="Remove from this device"
        aria-label={`Remove ${label} from this device`}
        onClick={() => {
          setConfirming(true);
          void count([profile]);
        }}
      >
        <TrashIcon />
      </Button>
      <RemoveDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Remove vault"
        description={removeVaultDescription(linked, pending)}
        removeTitle="Remove vault"
        onRemove={() => {
          setConfirming(false);
          void removeProfile(profile.profileId);
        }}
      />
    </li>
  );
}

function AddLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: LucideIcon;
  children: string;
}) {
  return (
    <Link href={href} className={cn(ROW, ROW_FOCUS, "font-medium text-[0.95rem]")}>
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
      >
        <Icon className="size-5" />
      </span>
      {children}
    </Link>
  );
}

/** Its warning counts what is lost for good, see `removeVaultsDescription`. */
function RemoveAllButton() {
  const { profiles, removeAllProfiles } = useStore();
  const { pending, count } = useProfilesPendingChanges();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="lg"
        className="w-full"
        onClick={() => {
          setConfirming(true);
          void count(profiles);
        }}
      >
        <TrashIcon data-icon="inline-start" />
        Remove all vaults from this device
      </Button>
      <RemoveDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Remove all vaults"
        description={removeVaultsDescription(profiles, pending)}
        removeTitle="Remove all"
        onRemove={() => {
          setConfirming(false);
          void removeAllProfiles();
        }}
      />
    </>
  );
}
