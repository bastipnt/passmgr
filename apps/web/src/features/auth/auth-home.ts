import { useStore } from "@repo/client";
import { authPaths } from "@/app/route-paths";

/** Where an auth page's Back leads: the unlock when the device holds a vault, else welcome. */
export function useAuthHome(): string {
  return useStore().profiles.length > 0 ? authPaths.login : authPaths.welcome;
}
