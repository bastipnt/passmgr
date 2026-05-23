import { install } from "react-native-quick-crypto";
install();

import "react-native-get-random-values";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { TamaguiProvider, Text, View } from "tamagui";
import { ClientProvider, PreferencesProvider, SessionProvider, StoreProvider } from "@repo/client";
import { tamaguiConfig } from "@repo/ui-native";
import "react-native-reanimated";
import { usePreferencesStore } from "@/hooks/use-preferences-store";
import { useVaultStore } from "@/hooks/use-vault-store";

const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:3000";

function Header() {
  return (
    <View>
      <Text color="$accent10" fontSize="$xl">
        Passmgr
      </Text>
    </View>
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
      <PreferencesProvider store={preferencesStore}>
        <SessionProvider>
          <ClientProvider serverUrl={serverUrl}>
            <StoreProvider vault={vaultStore}>
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: "#eee" },
                  headerTitle: (props) => <Header />,
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(app)" />
              </Stack>
              <StatusBar style="auto" />
            </StoreProvider>
          </ClientProvider>
        </SessionProvider>
      </PreferencesProvider>
    </TamaguiProvider>
  );
}
