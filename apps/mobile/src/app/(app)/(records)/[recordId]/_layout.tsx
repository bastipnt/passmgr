import { Stack } from "expo-router";

export default function RecordLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="edit"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetCornerRadius: 24,
          sheetGrabberVisible: true,
        }}
      />
    </Stack>
  );
}
