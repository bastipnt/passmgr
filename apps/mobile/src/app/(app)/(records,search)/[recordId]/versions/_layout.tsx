import { Stack } from "expo-router";
import { useResolveClassNames } from "uniwind";

/**
 * The whole group is presented as one form sheet by the parent layout, so the
 * list → detail step pushes inside that sheet rather than stacking a second
 * one on top of it — matching web, where a single sheet swaps its content.
 */
export default function VersionsLayout() {
  const contentStyle = useResolveClassNames("bg-background");

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[version]" />
    </Stack>
  );
}
