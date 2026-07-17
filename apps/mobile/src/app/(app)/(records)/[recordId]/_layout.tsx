import { Stack } from "expo-router";
import { useResolveClassNames } from "uniwind";

export default function RecordLayout() {
  const contentStyle = useResolveClassNames("bg-background");

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
    </Stack>
  );
}
