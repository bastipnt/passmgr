import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import VersionDetail from "@/features/records/components/VersionDetail";

export default function VersionScreen() {
  const router = useRouter();
  const { recordId, version } = useLocalSearchParams();
  const headerTitleStyle = useResolveClassNames("text-foreground");
  const foregroundColor = useCSSVariable("--color-foreground") as string;

  const versionNumber = typeof version === "string" ? Number(version) : Number.NaN;

  return (
    <View className="flex-1">
      {/* The back item is ours: this screen is pushed inside the sheet's own
          stack, whose back button `headerBackVisible` renders without a title. */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          title: Number.isNaN(versionNumber) ? "Version" : `Version ${versionNumber}`,
          headerBackVisible: false,
          headerTitleStyle,
          unstable_headerLeftItems: () => [
            {
              type: "button",
              label: "All versions",
              accessibilityLabel: "All versions",
              icon: { type: "sfSymbol", name: "chevron.backward" },
              tintColor: foregroundColor,
              onPress: () => router.back(),
            },
          ],
        }}
      />

      <ScrollView className="flex-1" contentContainerClassName="gap-md p-md">
        {typeof recordId === "string" && !Number.isNaN(versionNumber) && (
          <VersionDetail recordId={recordId} version={versionNumber} />
        )}
      </ScrollView>
    </View>
  );
}
