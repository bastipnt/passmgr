import {
  SessionContext,
  type SessionMode,
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
import { settingsPaths } from "@/route-paths";

const STATUS: Record<SessionMode, string> = {
  local: "This vault lives only on this device. It has no account and is not backed up.",
  online: "Signed in. Changes sync with your account.",
  offline: "Not connected to the server. Your vault stays usable and syncs once you sign in again.",
};

export default function SettingsScreen() {
  const router = useRouter();
  const { mode, networkOffline } = useContext(SessionContext);
  const { profile } = useStore();
  const { signOut, signingOut } = useSignOut();
  const { removeFromDevice, removing } = useRemoveFromDevice();
  const reconnectRef = useRef<BottomSheetRef>(null);
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
                {linked ? profile.email : "Local vault"}
              </Text>
              {mode === "offline" && !networkOffline && (
                <Button size="lg" onPress={() => reconnectRef.current?.triggerShowHide(true)}>
                  Sign in again
                </Button>
              )}
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

        <RemoveDialog
          title="Remove vault from this device?"
          description={
            linked
              ? "This deletes the vault from this device. Your account and the data on the server are not affected."
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
    </Screen>
  );
}
