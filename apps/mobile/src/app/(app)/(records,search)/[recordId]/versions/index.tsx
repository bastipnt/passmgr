import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import VersionList from "@/features/records/components/VersionList";

export default function VersionsScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams();
  const headerTitleStyle = useResolveClassNames("text-foreground");
  const foregroundColor = useCSSVariable("--color-foreground") as string;

  return (
    <View className="flex-1">
      {/* The nested stack draws its own headers inside the sheet: the title
          replaces the in-content heading, and closing pops the sheet itself. */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          title: "Version history",
          headerTitleStyle,
          unstable_headerRightItems: () => [
            {
              type: "button",
              label: "Close",
              accessibilityLabel: "Close",
              icon: { type: "sfSymbol", name: "xmark" },
              tintColor: foregroundColor,
              onPress: () => router.back(),
            },
          ],
        }}
      />

      <ScrollView className="flex-1" contentContainerClassName="gap-md p-md">
        {typeof recordId === "string" && <VersionList recordId={recordId} />}
      </ScrollView>
    </View>
  );
}
