import { Stack } from "expo-router";
import { useResolveClassNames } from "uniwind";

export default function RecordLayout() {
  const contentStyle = useResolveClassNames("bg-background");

  // `PasswordGeneratorProvider` lives in the parent layout — shared with the
  // create sheet.
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false, contentStyle }} />
      <Stack.Screen
        name="edit"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetGrabberVisible: true,
          contentStyle,
        }}
      />
      <Stack.Screen
        name="generate-password"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetGrabberVisible: true,
          contentStyle,
        }}
      />
    </Stack>
  );
}
