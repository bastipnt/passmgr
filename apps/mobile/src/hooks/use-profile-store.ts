import { ProfileStore } from "@repo/store";
import { createNativeDriver } from "@repo/store/drivers/native";
import { useRef } from "react";

/** The profiles on this device: one SQLite database each, plus the registry. */
export function useProfileStore() {
  const profilesRef = useRef<ProfileStore | null>(null);
  profilesRef.current ??= new ProfileStore(createNativeDriver);

  return profilesRef.current;
}
