import { router, Stack } from "expo-router";
import { useCSSVariable, useResolveClassNames } from "uniwind";

export default function SettingsLayout() {
  const contentStyle = useResolveClassNames("bg-background");
  const headerTitleStyle = useResolveClassNames("text-foreground");
  const foregroundColor = useCSSVariable("--color-foreground") as string;

  // The index is a tab root and paints its own status-bar strip, so it keeps the
  // header hidden. The sub-screens show one — that is where the back button
  // comes from; every other stack in the app hand-rolls one in `PageActions`
  // because it has no header to hang it on.
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
        options={{ title: "Settings", unstable_headerLeftItems: () => [] }}
      />
      <Stack.Screen name="general" options={{ title: "General" }} />
      <Stack.Screen name="generator" options={{ title: "Password Generator" }} />
      <Stack.Screen name="security" options={{ title: "Security" }} />
    </Stack>
  );
}
