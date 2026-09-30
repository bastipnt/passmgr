import { FONT } from "@repo/ui-native";
import { router, Stack } from "expo-router";
import { useCSSVariable, useResolveClassNames } from "uniwind";

export default function SettingsLayout() {
  const contentStyle = useResolveClassNames("bg-edge-tint");
  const headerTitleStyle = useResolveClassNames("text-foreground");
  const foregroundColor = useCSSVariable("--color-foreground") as string;

  // The index is a tab root with a native large title (web's display-font
  // page title); sub-screens get the back item.
  return (
    <Stack
      screenOptions={{
        contentStyle,
        headerTitleStyle,
        headerBackTitle: "Settings",
        headerTransparent: true,
        unstable_headerLeftItems: () => [
          {
            type: "button",
            label: "Back",
            accessibilityLabel: "Back",
            icon: { type: "sfSymbol", name: "chevron.backward" },
            tintColor: foregroundColor,
            onPress: () => router.back(),
          },
        ],
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Settings",
          headerLargeTitle: true,
          headerLargeTitleStyle: { fontFamily: FONT.display, color: foregroundColor },
          unstable_headerLeftItems: () => [],
        }}
      />
      <Stack.Screen name="general" options={{ title: "General" }} />
      <Stack.Screen name="generator" options={{ title: "Password Generator" }} />
      <Stack.Screen name="security" options={{ title: "Security" }} />
    </Stack>
  );
}
