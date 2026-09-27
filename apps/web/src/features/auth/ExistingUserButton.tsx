import { ChevronRightIcon } from "lucide-react";

type ExistingUserButtonProps = {
  storedEmail: string;
  toggleSwitchUser: () => void;
};

/** Shortcut under the login card: unlock the vault already stored on this device. */
export default function ExistingUserButton({
  storedEmail,
  toggleSwitchUser,
}: ExistingUserButtonProps) {
  return (
    <button
      type="button"
      onClick={toggleSwitchUser}
      className="glass flex w-full cursor-pointer items-center gap-3 rounded-2xl p-3 text-left outline-none transition-colors hover:bg-white/70 focus-visible:ring-4 focus-visible:ring-ring/25 dark:hover:bg-white/10"
    >
      <AccountAvatar email={storedEmail} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-sm">{storedEmail}</span>
        <span className="text-muted-foreground text-xs">Unlock existing vault</span>
      </span>
      <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
    </button>
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
