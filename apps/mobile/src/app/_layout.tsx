import { install } from "react-native-quick-crypto";
install();

import "react-native-get-random-values";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useColorScheme } from "react-native";
import { TamaguiProvider } from "tamagui";
import {
  ClientProvider,
  PreferencesProvider,
  SessionContext,
  SessionProvider,
  StoreProvider,
} from "@repo/client";
import { tamaguiConfig } from "@repo/ui-native";
import "react-native-reanimated";
import { usePreferencesStore } from "@/hooks/use-preferences-store";
import { useVaultStore } from "@/hooks/use-vault-store";
import { useContext } from "react";

const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:3000";

function Routes() {
  const { loggedIn } = useContext(SessionContext);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Protected guard={loggedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Screen name="(auth)" />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const preferencesStore = usePreferencesStore();
  const vaultStore = useVaultStore();

  return (
    <TamaguiProvider
      config={tamaguiConfig}
      defaultTheme={colorScheme === "dark" ? "dark" : "light"}
    >
      <SafeAreaProvider>
        <PreferencesProvider store={preferencesStore}>
          <SessionProvider>
            <ClientProvider serverUrl={serverUrl}>
              <StoreProvider vault={vaultStore}>
                <Routes />
              </StoreProvider>
            </ClientProvider>
          </SessionProvider>
        </PreferencesProvider>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}
