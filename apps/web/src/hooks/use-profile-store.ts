import { ProfileStore } from "@repo/store";
import { createWebDriver } from "@repo/store/drivers/web";
import { useRef } from "react";

/** The profiles on this device: one OPFS database each, plus the registry. */
export function useProfileStore() {
  const profilesRef = useRef<ProfileStore | null>(null);
  profilesRef.current ??= new ProfileStore(createWebDriver);

  return profilesRef.current;
}
