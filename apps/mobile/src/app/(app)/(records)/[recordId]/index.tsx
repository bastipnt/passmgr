import Record from "@/features/records/components/Record";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, ScrollView } from "react-native";
import { Button } from "@repo/ui-native";

export default function RecordScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams();

  return (
    <ScrollView>
      <Button onPress={() => router.navigate(`/${recordId as string}/edit`)}>Edit</Button>
      <View className="flex-1 bg-background p-lg">
        <Record recordId={recordId} />
      </View>
    </ScrollView>
  );
}
