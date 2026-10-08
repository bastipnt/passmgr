import { useBackupReminder } from "@repo/client";
import { toast } from "@repo/ui";
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { settingsPaths } from "@/app/route-paths";

const TOAST_ID = "backup-reminder";

/**
 * Recurring reminder for a local-only vault (ADR 0001 D12): its only copy is
 * this browser's storage. Shown while the vault is open once the reminder is
 * due; its buttons and swiping it away put it off for another interval.
 * Renders nothing.
 */
export default function BackupReminder() {
  const { due, snooze } = useBackupReminder();
  const [, navigate] = useLocation();
  // Sonner calls `onDismiss` for `toast.dismiss` too: leaving isn't putting it off.
  const leaving = useRef(false);

  useEffect(() => {
    if (!due) return;
    leaving.current = false;
    toast.warning("Back up your vault", {
      id: TOAST_ID,
      description:
        "It exists only in this browser. If the browser clears its data, it's gone. Create an online account to keep a copy.",
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: "Create account",
        onClick: () => {
          snooze();
          navigate(settingsPaths.security);
        },
      },
      cancel: { label: "Later", onClick: snooze },
      onDismiss: () => {
        if (!leaving.current) snooze();
      },
    });
    // Locking or leaving the vault takes the reminder along; it comes back while due.
    return () => {
      leaving.current = true;
      toast.dismiss(TOAST_ID);
    };
  }, [due, snooze, navigate]);

  return null;
}
