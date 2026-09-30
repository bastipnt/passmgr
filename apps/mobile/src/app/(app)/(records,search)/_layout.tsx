import { Stack } from "expo-router";
import { useResolveClassNames } from "uniwind";
import { PasswordGeneratorProvider } from "@/features/password-generation/PasswordGeneratorContext";

export default function RecordsLayout() {
  const contentStyle = useResolveClassNames("bg-edge-tint");
  // Sheets are solid popover panels, like web's phone drawer.
  const sheetStyle = useResolveClassNames("bg-popover");

  // The provider sits above the whole stack so the create sheet and the record
  // stack below it both hand generated passwords back to their own field.
  return (
    <PasswordGeneratorProvider>
      <Stack>
        {/* The screen turns its own header on — it owns the sort menu state. */}
        <Stack.Screen name="index" options={{ contentStyle }} />
        <Stack.Screen name="search" options={{ headerShown: false, title: "", contentStyle }} />

        <Stack.Screen
          name="[recordId]"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="new"
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
      </Stack>
    </PasswordGeneratorProvider>
  );
}
