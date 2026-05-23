import { Vault } from "@repo/store";
import { createWebDriver } from "@repo/store/drivers/web";
import { useRef } from "react";

export function useVaultStore() {
  const vaultRef = useRef<Vault | null>(null);
  if (!vaultRef.current) vaultRef.current = new Vault(createWebDriver());

  return vaultRef.current;
}
