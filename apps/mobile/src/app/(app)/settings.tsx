import { useContext } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { SessionContext, useLogout } from "@repo/client";
import { Button, Main, ScrollView, Text, YStack } from "tamagui";
import { BlurView, Spinner } from "@repo/ui-native";
import { Alert, StyleSheet } from "react-native";

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
    <Main bg="$background">
      <ScrollView minH="100%">
        <SafeAreaView>
          <YStack p="$2" gap="$4">
            <Text fontSize="$lg">Settings</Text>
            <Text>Logged in with sessionId: {sessionId}</Text>
            <Button
              theme="error"
              disabled={loggingOut}
              icon={loggingOut ? <Spinner /> : undefined}
              onPress={confirmLogout}
            >
              {loggingOut ? "Logging out…" : "Log out"}
            </Button>
          </YStack>
        </SafeAreaView>
      </ScrollView>

      <BlurView
        intensity={50}
        tint="default"
        style={[StyleSheet.absoluteFill, { bottom: undefined }]}
        height={insets.top}
      />
    </Main>
  );
}
