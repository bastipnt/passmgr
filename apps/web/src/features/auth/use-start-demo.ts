import { DEMO_VAULT_ERROR_MESSAGES, type DemoVaultError, useDemoVault } from "@repo/client";
import { toast } from "@repo/ui";
import { useState } from "react";
import { useHoldUnlockRedirect } from "./unlock-redirect";

/** `startDemo` with the page held on screen until the example data is in. */
export function useStartDemo() {
  const { startDemo, continueDemo } = useDemoVault();
  const holdRedirect = useHoldUnlockRedirect();
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<DemoVaultError>();

  async function start() {
    setError(undefined);
    setPreparing(true);
    holdRedirect(true);
    try {
      const failed = await startDemo();
      if (failed === "seed_failed") toast.error(DEMO_VAULT_ERROR_MESSAGES.seed_failed);
      else setError(failed);
    } finally {
      setPreparing(false);
      holdRedirect(false);
    }
  }

  return {
    start,
    continueDemo,
    preparing,
    errorMessage: error && DEMO_VAULT_ERROR_MESSAGES[error],
  };
}
