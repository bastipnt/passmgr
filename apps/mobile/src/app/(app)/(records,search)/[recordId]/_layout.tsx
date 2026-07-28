import { Stack } from "expo-router";
import { useResolveClassNames } from "uniwind";
import { PasswordGeneratorProvider } from "@/features/password-generation/PasswordGeneratorContext";

export default function RecordLayout() {
  const contentStyle = useResolveClassNames("bg-background");

  return (
    <PasswordGeneratorProvider>
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
    </PasswordGeneratorProvider>
  );
}
