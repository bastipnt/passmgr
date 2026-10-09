import {
  SessionContext,
  type SessionMode,
  unsyncedChangesWarning,
  usePendingChangeCount,
  useRemoveFromDevice,
  useSignOut,
  useStore,
} from "@repo/client";
import {
  type BottomSheetRef,
  Button,
  RemoveDialog,
  Screen,
  SettingsGroup,
  SettingsNavRow,
  SettingsSection,
} from "@repo/ui-native";
import { useRouter } from "expo-router";
import { KeyRound, ShieldCheck, SlidersHorizontal } from "lucide-react-native";
import { useContext, useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { ReconnectSheet } from "@/features/auth/components/ReconnectSheet";
import { ChangePasswordSheet } from "@/features/settings/components/ChangePasswordSheet";
import { CreateAccountSheet } from "@/features/settings/components/CreateAccountSheet";
import { SyncSection } from "@/features/settings/components/SyncSection";
import { settingsPaths } from "@/route-paths";

const STATUS: Record<SessionMode, string> = {
  local: "This vault lives only on this device. It has no account and is not backed up.",
  online: "Signed in. Changes sync with your account.",
  offline: "Not connected to the server. Your vault stays usable and syncs once you sign in again.",
};

export default function SettingsScreen() {
  const router = useRouter();
  const { mode, networkOffline } = useContext(SessionContext);
  const { profile, active } = useStore();
  const { signOut, signingOut } = useSignOut();
  const { removeFromDevice, removing } = useRemoveFromDevice();
  const pendingChanges = usePendingChangeCount();
  const reconnectRef = useRef<BottomSheetRef>(null);
  const changePasswordRef = useRef<BottomSheetRef>(null);
  const createAccountRef = useRef<BottomSheetRef>(null);
  const iconColor = useCSSVariable("--color-muted-foreground") as string;
  const linked = profile?.mode === "linked";

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-8 pt-4 pb-10"
      >
        <SettingsGroup>
          <SettingsNavRow
            title="General"
            icon={<SlidersHorizontal size={18} color={iconColor} />}
            onPress={() => router.navigate(settingsPaths.general)}
          />
          <SettingsNavRow
            title="Password Generator"
            icon={<KeyRound size={18} color={iconColor} />}
            onPress={() => router.navigate(settingsPaths.generator)}
          />
          <SettingsNavRow
            title="Security"
            icon={<ShieldCheck size={18} color={iconColor} />}
            onPress={() => router.navigate(settingsPaths.security)}
          />
        </SettingsGroup>

        {mode && (
          <SettingsSection title="Account" description={STATUS[mode]}>
            <View className="gap-3">
              <Text className="text-[16px] text-foreground">
                {linked ? profile.email : (active?.entry.name ?? "Local vault")}
              </Text>
              {!linked && (
                <Button
                  size="lg"
                  disabled={removing}
                  onPress={() => createAccountRef.current?.triggerShowHide(true)}
                >
                  Create online account
                </Button>
              )}
              {mode === "offline" && !networkOffline && (
                <Button size="lg" onPress={() => reconnectRef.current?.triggerShowHide(true)}>
                  Sign in again
                </Button>
              )}
              <Button
                size="lg"
                variant="glass"
                disabled={signingOut || removing}
                onPress={() => changePasswordRef.current?.triggerShowHide(true)}
              >
                Change password
              </Button>
              {linked && (
                <Button
                  size="lg"
                  variant="glass"
                  loading={signingOut}
                  disabled={removing}
                  onPress={() => void signOut()}
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </Button>
              )}
            </View>
          </SettingsSection>
        )}

        {linked && <SyncSection />}

        <RemoveDialog
          title="Remove vault from this device?"
          description={
            linked
              ? `This deletes the vault from this device. Your account and the data on the server are not affected.${unsyncedChangesWarning(pendingChanges)}`
              : "This deletes the only copy of your vault. Without an export, everything in it is lost."
          }
          removeTitle="Remove"
          closeTitle="Cancel"
          onRemove={() => void removeFromDevice()}
        >
          <Button
            size="lg"
            variant="destructive"
            className="mx-5"
            loading={removing}
            disabled={signingOut}
          >
            {removing ? "Removing…" : "Remove vault from this device"}
          </Button>
        </RemoveDialog>
      </ScrollView>

      <ReconnectSheet ref={reconnectRef} />
      <ChangePasswordSheet ref={changePasswordRef} linked={linked} />
      <CreateAccountSheet ref={createAccountRef} />
    </Screen>
  );
}
