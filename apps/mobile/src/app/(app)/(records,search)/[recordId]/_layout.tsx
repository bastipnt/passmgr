import { router, Stack } from "expo-router";
import { useCSSVariable, useResolveClassNames } from "uniwind";

export default function RecordLayout() {
  const contentStyle = useResolveClassNames("bg-edge-tint");
  // Sheets are solid popover panels, like web's phone drawer.
  const sheetStyle = useResolveClassNames("bg-popover");
  const headerTitleStyle = useResolveClassNames("font-display-bold text-foreground");
  const foregroundColor = useCSSVariable("--color-foreground") as string;

  // `PasswordGeneratorProvider` lives in the parent layout — shared with the
  // create sheet.
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          contentStyle,
          headerTitleStyle,
          // The screen sets the title itself once its hero scrolls away.
          title: "",
          headerTransparent: true,
          // Our own back item: as the first route of its own stack, the system one never
          // renders (`canGoBack` is false); `router.back()` pops the parent stack.
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
          // Right items (Edit, Copy password) come from the screen, which has the record.
        }}
      />
      <Stack.Screen
        name="edit"
        options={{
          presentation: "formSheet",
          sheetGrabberVisible: true,
          contentStyle: sheetStyle,
        }}
      />
      <Stack.Screen
        name="generate-password"
        options={{
          presentation: "formSheet",
          sheetGrabberVisible: true,
          contentStyle: sheetStyle,
        }}
      />
      <Stack.Screen
        name="versions"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetGrabberVisible: true,
          // Taller than the default half sheet — a diff of a full record runs long.
          sheetAllowedDetents: [0.6, 1],
          contentStyle: sheetStyle,
        }}
      />
    </Stack>
  );
}
