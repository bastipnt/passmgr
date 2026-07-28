import { Stack } from "expo-router";

export default function RecordsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="search" options={{ headerShown: false }} />

      <Stack.Screen
        name="[recordId]"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
