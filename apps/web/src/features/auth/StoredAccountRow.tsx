import { Button } from "@repo/ui/components/Button";
import { AccountAvatar, LocalVaultAvatar } from "./ProfileList";

type StoredAccountRowProps = {
  /** Omitted for a vault without an account. */
  email?: string;
  /** A local vault's name, if it has one. */
  name?: string | null;
  /** Omitted when there is nothing to switch to. */
  onSwitch?: () => void;
};

/** Account strip at the top of the unlock card, with a way to another vault or account. */
export default function StoredAccountRow({ email, name, onSwitch }: StoredAccountRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-foreground/10 bg-white/50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
      {email ? <AccountAvatar email={email} /> : <LocalVaultAvatar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-sm">
          {email ?? name ?? "Vault on this device"}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <span className="size-1.5 rounded-full bg-success" aria-hidden />
          {email ? "Vault on this device" : "No account · not synced"}
        </span>
      </div>
      {onSwitch && (
        <Button type="button" variant="outline" size="sm" onClick={onSwitch}>
          Switch
        </Button>
      )}
    </div>
  );
}
