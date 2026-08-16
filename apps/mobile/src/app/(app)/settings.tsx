import { SessionContext, useLogout } from "@repo/client";
import { BlurView, Button, RemoveDialog } from "@repo/ui-native";
import { useContext } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemeSwitch } from "@/components/ThemeSwitch";

export default function SettingsScreen() {
  const { sessionId } = useContext(SessionContext);
  const { logout, loggingOut } = useLogout();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ minHeight: "100%" }}>
        <SafeAreaView>
          <View className="gap-md p-md">
            <Text className="text-foreground text-lg">Settings</Text>
            <Text className="text-foreground">Logged in with sessionId: {sessionId}</Text>
            <ThemeSwitch />
            <RemoveDialog
              title="Log out?"
              description="This removes your vault data from this device."
              removeTitle="Log out"
              closeTitle="Cancel"
              onRemove={() => void logout()}
            >
              <Button size="lg" variant="destructive" loading={loggingOut}>
                {loggingOut ? "Logging out…" : "Log out"}
              </Button>
            </RemoveDialog>
          </View>
        </SafeAreaView>
      </ScrollView>

      <BlurView
        intensity={50}
        tint="default"
        style={[StyleSheet.absoluteFill, { bottom: undefined, height: insets.top }]}
      />
    </View>
  );
}
