import { useSignOut, useStore } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import { LockIcon, LogOutIcon } from "lucide-react";
import { useLockVault } from "@/hooks/use-lock-vault";

/** Web keys live in memory only: a reload drops every key and any decrypted state. */
const reload = () => window.location.reload();

/** Lock now, and Sign out for a synced account. */
export function SessionActions({ className }: { className?: string }) {
  const { profile } = useStore();
  const lockVault = useLockVault();
  const { signOut, signingOut } = useSignOut();
  const size = useIsMobile() ? "lg" : "default";

  return (
    <div className={cn("flex gap-2", className)}>
      <Button variant="outline" size={size} className="flex-1" onClick={() => void lockVault()}>
        <LockIcon />
        Lock now
      </Button>
      {profile?.mode === "linked" && (
        <Button
          variant="outline"
          size={size}
          className="flex-1"
          disabled={signingOut}
          onClick={() => void signOut().then(reload)}
        >
          <LogOutIcon />
          Sign out
        </Button>
      )}
    </div>
  );
}
