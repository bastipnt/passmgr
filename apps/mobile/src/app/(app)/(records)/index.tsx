import { ScrollView, StyleSheet, View } from "react-native";
import { RecordsList } from "@/features/records/components/RecordsList";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "@repo/ui-native";
import { useRecordSearch } from "@repo/client";

export default function RecordsScreen() {
  const insets = useSafeAreaInsets();
  const recordGroups = useRecordSearch("");

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerClassName="flex-grow">
        <SafeAreaView>
          <RecordsList recordGroups={recordGroups} />
        </SafeAreaView>
      </ScrollView>

      <BlurView
        intensity={50}
        tint="default"
        style={[StyleSheet.absoluteFill, { bottom: undefined, height: insets.top }]}
      />
    </View>
  );
}
