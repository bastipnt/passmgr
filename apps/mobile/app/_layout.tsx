import { install } from "react-native-quick-crypto";
install();

import "react-native-get-random-values";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ClientProvider, SessionProvider } from "@repo/client";
import "react-native-reanimated";

const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:3000";

export default function RootLayout() {
  return (
    <SessionProvider>
      <ClientProvider serverUrl={serverUrl}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
        <StatusBar style="auto" />
      </ClientProvider>
    </SessionProvider>
  );
}
