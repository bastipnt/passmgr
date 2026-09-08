import { useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import Record from "@/features/records/components/Record";

export default function RecordScreen() {
  const { recordId } = useLocalSearchParams();

  return (
    <View className="flex-1">
      {/* Padding lives on the content container only — on the ScrollView itself
          it would stack with the offset that clears the floating buttons. */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-4"
        // contentContainerStyle={{ paddingTop: insets.top + 24 }}
      >
        <Record recordId={recordId} />
      </ScrollView>
    </View>
  );
}
