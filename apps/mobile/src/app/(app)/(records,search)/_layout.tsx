import { Stack } from "expo-router";
import { useResolveClassNames } from "uniwind";
import { PasswordGeneratorProvider } from "@/features/password-generation/PasswordGeneratorContext";

export default function RecordsLayout() {
  const contentStyle = useResolveClassNames("bg-background");

  // The provider sits above the whole stack so the create sheet and the record
  // stack below it both hand generated passwords back to their own field.
  return (
    <PasswordGeneratorProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false, contentStyle }} />
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
    </PasswordGeneratorProvider>
  );
}
