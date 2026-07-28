import { install } from "react-native-quick-crypto";
install();

import "react-native-get-random-values";
import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Uniwind, useResolveClassNames } from "uniwind";
import {
  ClientProvider,
  PreferencesProvider,
  SessionContext,
  SessionProvider,
  StoreProvider,
  useSessionRestore,
} from "@repo/client";
import { SplashScreen } from "@/components/SplashScreen";
import "react-native-reanimated";
import { usePreferencesStore } from "@/hooks/use-preferences-store";
import { getStoredTheme } from "@/hooks/use-theme-preference";
import { useVaultStore } from "@/hooks/use-vault-store";
import { useContext, useEffect } from "react";

const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:3000";

function Routes() {
  const { loggedIn } = useContext(SessionContext);
  const { status, tryRestore } = useSessionRestore();
  const contentStyle = useResolveClassNames("bg-background");

  useEffect(() => {
    void tryRestore();
  }, [tryRestore]);

  // While restoring a persisted session (and showing the OS biometric prompt),
  // hold on a splash instead of flashing the login screen.
  if (status === "restoring") {
    return (
      <>
        <SplashScreen />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle,
        }}
      >
        <Stack.Protected guard={loggedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!loggedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

export default function RootLayout() {
  const preferencesStore = usePreferencesStore();
  const vaultStore = useVaultStore();

  // Apply the persisted appearance choice. Uniwind's light/dark themes are
  // adaptive; "system" (the default) re-enables tracking the OS color scheme.
  useEffect(() => {
    Uniwind.setTheme(getStoredTheme(preferencesStore));
  }, [preferencesStore]);

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <PreferencesProvider store={preferencesStore}>
          <SessionProvider>
            <ClientProvider serverUrl={serverUrl}>
              <StoreProvider vault={vaultStore}>
                <Routes />
              </StoreProvider>
            </ClientProvider>
          </SessionProvider>
        </PreferencesProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
