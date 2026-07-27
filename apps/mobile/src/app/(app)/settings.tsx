import { useContext } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { SessionContext, useLogout } from "@repo/client";
import { View, ScrollView, Text, StyleSheet } from "react-native";
import { BlurView, Button, RemoveDialog, Spinner } from "@repo/ui-native";
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
            <Text className="text-lg text-foreground">Settings</Text>
            <Text className="text-foreground">Logged in with sessionId: {sessionId}</Text>
            <ThemeSwitch />
            <RemoveDialog
              title="Log out?"
              description="This removes your vault data from this device."
              removeTitle="Log out"
              closeTitle="Cancel"
              onRemove={() => void logout()}
            >
              <Button
                variant="destructive"
                disabled={loggingOut}
                icon={loggingOut ? <Spinner /> : undefined}
              >
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
