import { useContext } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { SessionContext, useLogout } from "@repo/client";
import { View, ScrollView, Text, Alert, StyleSheet } from "react-native";
import { BlurView, Button, Spinner } from "@repo/ui-native";

export default function SettingsScreen() {
  const { sessionId } = useContext(SessionContext);
  const { logout, loggingOut } = useLogout();
  const insets = useSafeAreaInsets();

  function confirmLogout() {
    Alert.alert("Log out?", "This removes your vault data from this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void logout() },
    ]);
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ minHeight: "100%" }}>
        <SafeAreaView>
          <View className="gap-md p-md">
            <Text className="text-lg text-foreground">Settings</Text>
            <Text className="text-foreground">Logged in with sessionId: {sessionId}</Text>
            <Button
              variant="destructive"
              disabled={loggingOut}
              icon={loggingOut ? <Spinner /> : undefined}
              onPress={confirmLogout}
            >
              {loggingOut ? "Logging out…" : "Log out"}
            </Button>
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
