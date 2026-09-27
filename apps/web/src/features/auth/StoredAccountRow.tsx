import { Button } from "@repo/ui/components/Button";
import { AccountAvatar } from "./ExistingUserButton";

type StoredAccountRowProps = {
  email: string;
  onSwitch: () => void;
};

/** Account strip at the top of the unlock card, with a way back to a normal login. */
export default function StoredAccountRow({ email, onSwitch }: StoredAccountRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-foreground/10 bg-white/50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <AccountAvatar email={email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-sm">{email}</span>
        <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <span className="size-1.5 rounded-full bg-success" aria-hidden />
          Vault on this device
        </span>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onSwitch}>
        Switch
      </Button>
    </div>
  );
}
