import { Stack } from "expo-router";
import { useResolveClassNames } from "uniwind";

export default function AuthLayout() {
  const contentStyle = useResolveClassNames("bg-background/50");

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="sign-in"
        options={{
          presentation: "formSheet",
          headerShown: false,
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.6],
          contentStyle,
        }}
      />
      <Stack.Screen
        name="sign-up"
        options={{
          presentation: "formSheet",
          headerShown: false,
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.82],
          contentStyle,
        }}
      />
    </Stack>
  );
}
