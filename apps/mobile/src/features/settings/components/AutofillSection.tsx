import { useAutofillState } from "@repo/client";
import { Button, SettingsSection } from "@repo/ui-native";
import { Platform, Text, View } from "react-native";
import { useAppActive } from "@/hooks/use-app-active";

const HOW_TO_ENABLE =
  Platform.OS === "ios"
    ? "Turn on Passmgr in Settings → General → AutoFill & Passwords."
    : "Pick Passmgr as the autofill service in the system settings.";

/** OS autofill: switched on in the system settings, not here. */
export function AutofillSection() {
  const { state, openSettings } = useAutofillState(useAppActive());
  if (state === "unavailable") return null;

  return (
    <SettingsSection
      title="AutoFill"
      description="Fills your logins into other apps and websites after Face ID, Touch ID or your fingerprint. Logins from every vault of this profile are offered."
    >
      <View className="gap-3">
        <Text className="text-[16px] text-foreground">
          {state === null ? "Checking…" : state === "enabled" ? "On" : `Off · ${HOW_TO_ENABLE}`}
        </Text>
        {state === "disabled" && (
          <Button size="lg" variant="glass" onPress={() => void openSettings()}>
            Open settings
          </Button>
        )}
      </View>
    </SettingsSection>
  );
}
