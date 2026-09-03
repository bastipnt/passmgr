import { Button, SheetActions } from "@repo/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import VersionDetail from "@/features/records/components/VersionDetail";

export default function VersionScreen() {
  const router = useRouter();
  const { recordId, version } = useLocalSearchParams();

  const versionNumber = typeof version === "string" ? Number(version) : Number.NaN;

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerClassName="gap-md p-md pt-20">
        <Text className="font-semibold text-foreground text-xl">
          {Number.isNaN(versionNumber) ? "Version" : `Version ${versionNumber}`}
        </Text>

        {typeof recordId === "string" && !Number.isNaN(versionNumber) && (
          <VersionDetail recordId={recordId} version={versionNumber} />
        )}
      </ScrollView>

      <SheetActions>
        <Button
          hug
          variant="glass"
          size="icon-lg"
          systemImage="chevron.backward"
          accessibilityLabel="All versions"
          onPress={() => router.back()}
        />
      </SheetActions>
    </View>
  );
}
