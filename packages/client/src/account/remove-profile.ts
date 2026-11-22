type ProfileStore = {
  removeProfile: (profileId: string) => Promise<void>;
  removeAllProfiles: () => Promise<void>;
};

/** One profile by id, or every profile on the device. */
export type ProfileRemoval = { profileId: string } | "all";

/**
 * Remove profiles from this device (ADR 0001 D2). Locks first: that stops the sync, so nothing
 * writes into a database while it's being deleted.
 */
export async function removeProfile(
  { lock, store }: { lock: () => void; store: ProfileStore },
  which: ProfileRemoval,
): Promise<void> {
  lock();
  await (which === "all" ? store.removeAllProfiles() : store.removeProfile(which.profileId));
}
