import { Stack } from "expo-router";
import { useResolveClassNames } from "uniwind";

export default function RecordsLayout() {
  const contentStyle = useResolveClassNames("bg-background");

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false, contentStyle }} />
      <Stack.Screen name="search" options={{ headerShown: false, title: "", contentStyle }} />

      <Stack.Screen
        name="[recordId]"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
