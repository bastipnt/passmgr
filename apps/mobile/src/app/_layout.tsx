import { install } from "react-native-quick-crypto";

install();

import "react-native-get-random-values";
import "../global.css";

import {
  ClientProvider,
  PreferencesProvider,
  SessionContext,
  SessionProvider,
  StoreProvider,
  useSessionRestore,
} from "@repo/client";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useResolveClassNames } from "uniwind";
import { SplashScreen } from "@/components/SplashScreen";
import "react-native-reanimated";
import { useContext, useEffect } from "react";
import { useAppActive } from "@/hooks/use-app-active";
import { usePreferencesStore } from "@/hooks/use-preferences-store";
import { applyTheme, getStoredTheme } from "@/hooks/use-theme-preference";
import { useVaultStore } from "@/hooks/use-vault-store";
import { RNEventSourcePonyfill } from "@/lib/rn-event-source";

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
  const appActive = useAppActive();

  // Apply the persisted appearance choice. Uniwind's light/dark themes are
  // adaptive; "system" (the default) re-enables tracking the OS color scheme.
  useEffect(() => {
    applyTheme(getStoredTheme(preferencesStore));
  }, [preferencesStore]);

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <PreferencesProvider store={preferencesStore}>
          <SessionProvider>
            <ClientProvider serverUrl={serverUrl} eventSource={RNEventSourcePonyfill}>
              <StoreProvider vault={vaultStore} syncEnabled={appActive}>
                <Routes />
              </StoreProvider>
            </ClientProvider>
          </SessionProvider>
        </PreferencesProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
