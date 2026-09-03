import { Button, SheetActions } from "@repo/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import VersionList from "@/features/records/components/VersionList";

export default function VersionsScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams();

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerClassName="gap-md p-md pt-20">
        <Text className="font-semibold text-foreground text-xl">Version history</Text>

        {typeof recordId === "string" && <VersionList recordId={recordId} />}
      </ScrollView>

      <SheetActions>
        <Button
          hug
          variant="glass"
          size="icon-lg"
          systemImage="xmark"
          accessibilityLabel="Close"
          onPress={() => router.back()}
        />
      </SheetActions>
    </View>
  );
}
