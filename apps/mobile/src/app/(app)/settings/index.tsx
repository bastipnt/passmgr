import { useLogout } from "@repo/client";
import { Button, RemoveDialog, Screen, SettingsGroup, SettingsNavRow } from "@repo/ui-native";
import { useRouter } from "expo-router";
import { KeyRound, ShieldCheck, SlidersHorizontal } from "lucide-react-native";
import { ScrollView } from "react-native";
import { useCSSVariable } from "uniwind";
import { settingsPaths } from "@/route-paths";

export default function SettingsScreen() {
  const router = useRouter();
  const { logout, loggingOut } = useLogout();
  const iconColor = useCSSVariable("--color-muted-foreground") as string;

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

        <RemoveDialog
          title="Log out?"
          description="This removes your vault data from this device."
          removeTitle="Log out"
          closeTitle="Cancel"
          onRemove={() => void logout()}
        >
          <Button size="lg" variant="destructive" className="mx-5" loading={loggingOut}>
            {loggingOut ? "Logging out…" : "Log out"}
          </Button>
        </RemoveDialog>
      </ScrollView>
    </Screen>
  );
}
