import {
  AUTO_LOCK_PREFERENCE,
  SessionContext,
  useChoicePreference,
  useShortcut,
} from "@repo/client";
import { useContext } from "react";
import { useIdleLock } from "@/hooks/use-idle-lock";
import { useLockVault } from "@/hooks/use-lock-vault";
import { SHORTCUTS } from "@/lib/shortcuts";

function UnlockedVaultLock() {
  const lockVault = useLockVault();
  const [autoLockMinutes] = useChoicePreference(AUTO_LOCK_PREFERENCE);

  useIdleLock(autoLockMinutes, lockVault);
  useShortcut(SHORTCUTS.lockVault.key, lockVault, {
    description: SHORTCUTS.lockVault.description,
    allowInInput: true,
  });

  return null;
}

/** Idle lock and the lock shortcut on every route while the vault is unlocked. */
export function VaultLock() {
  const { vaultUnlocked } = useContext(SessionContext);
  return vaultUnlocked ? <UnlockedVaultLock /> : null;
}
