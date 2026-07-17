import Record from "@/features/records/components/Record";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { BlurView, Button, CloseChip } from "@repo/ui-native";

export default function RecordScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams();

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 p-lg pt-[80px]">
        <Record recordId={recordId} />
      </ScrollView>

      <BlurView
        intensity={50}
        tint="default"
        style={[StyleSheet.absoluteFill, { bottom: undefined, height: "auto" }]}
      >
        <View className="flex-row p-lg pb-md w-full justify-between gap-4">
          <CloseChip />
          <View className="flex-row gap-2">
            <Button size="sm" onPress={() => router.navigate(`/${recordId as string}/edit`)}>
              Edit
            </Button>
          </View>
        </View>
      </BlurView>
    </View>
  );
}
