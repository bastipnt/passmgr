import type { DecryptedRecord } from "@repo/schema";
import { useEffect, useMemo, useState } from "react";
import { missingTwoFactorOf } from "../records/pass-monitor";
import {
  loadedTwoFactorDirectory,
  loadTwoFactorDirectory,
  type TwoFactorDirectory,
  type TwoFactorSite,
} from "../records/two-factor-directory";

export type TwoFactorDirectoryState = {
  /** `null` while it loads, or when it failed to. */
  directory: TwoFactorDirectory | null;
  failed: boolean;
};

export function useTwoFactorDirectory(): TwoFactorDirectoryState {
  const [state, setState] = useState<TwoFactorDirectoryState>(() => ({
    directory: loadedTwoFactorDirectory() ?? null,
    failed: false,
  }));

  useEffect(() => {
    if (loadedTwoFactorDirectory()) return;
    let cancelled = false;
    loadTwoFactorDirectory()
      .then((directory) => {
        if (!cancelled) setState({ directory, failed: false });
      })
      .catch((error: unknown) => {
        console.error("Failed to load the 2FA directory", error);
        if (!cancelled) setState({ directory: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** The 2FA-capable site of a login without a TOTP secret; `undefined` otherwise or while loading. */
export function useMissingTwoFactor(record: DecryptedRecord): TwoFactorSite | undefined {
  const { directory } = useTwoFactorDirectory();
  return useMemo(
    () => (directory ? missingTwoFactorOf(record, directory) : undefined),
    [record, directory],
  );
}
