import { Stack } from "expo-router";
import { routeErrorFallback } from "@/components/RouteErrorFallback";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}

export const ErrorBoundary = routeErrorFallback("auth");
