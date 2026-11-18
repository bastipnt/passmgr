import { useStore } from "@repo/client";
import { SettingsPage } from "./SettingsPage";
import StorageSettings from "./StorageSettings";
import SyncSettings from "./SyncSettings";

/** How the vault syncs, and how safely this device keeps it. */
export default function SyncSettingsPage() {
  const linked = useStore().profile?.mode === "linked";

  return (
    <SettingsPage
      title="Sync & storage"
      description={
        linked
          ? "Your vault is kept on this device and synced, end-to-end encrypted, with your account."
          : "Your vault is kept on this device. Without an account, nothing syncs."
      }
    >
      <SyncSettings />
      <StorageSettings />
    </SettingsPage>
  );
}
