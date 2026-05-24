import { Stack } from "expo-router";

// RecordsProvider / SortedRecordsProvider are provided by the parent (app)
// layout, which wraps this whole group. Mounting them again here created a
// second RecordsProvider instance with its own state, so the vault was decrypted
// twice on login.
export default function RecordsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="[recordId]"
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
