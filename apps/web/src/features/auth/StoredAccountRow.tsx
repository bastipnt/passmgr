import { Button } from "@repo/ui/components/Button";
import { ProfileAvatar } from "@repo/ui/components/ProfileAvatar";
import { ArrowLeftRightIcon } from "lucide-react";

type StoredAccountRowProps = {
  /** Omitted for a vault without an account. */
  email?: string;
  /** A local vault's name, if it has one. */
  name?: string | null;
  /** The avatar's colour, see `ProfileAvatar`. */
  hue?: number;
  /** In place of "Synced account" / "On this device only". */
  detail?: string;
  /** Omitted when there is nothing to switch to. */
  onSwitch?: () => void;
};

export default function StoredAccountRow({
  email,
  name,
  hue,
  detail,
  onSwitch,
}: StoredAccountRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-foreground/8 bg-white/50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <ProfileAvatar email={email} hue={hue} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold text-[0.95rem]">
          {email ?? name ?? "Vault on this device"}
        </span>
        <span className="text-muted-foreground text-xs">
          {detail ?? (email ? "Synced account" : "On this device only")}
        </span>
      </div>
      {onSwitch && (
        <Button type="button" variant="outline" size="sm" onClick={onSwitch}>
          <ArrowLeftRightIcon data-icon="inline-start" />
          Switch
        </Button>
      )}
    </div>
  );
}
