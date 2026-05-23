import { Vault } from "@repo/store";
import { createNativeDriver } from "@repo/store/drivers/native";
import { useRef } from "react";

export function useVaultStore() {
  const vaultRef = useRef<Vault | null>(null);
  if (!vaultRef.current) vaultRef.current = new Vault(createNativeDriver());

  return vaultRef.current;
}
