import Record from "@/features/records/components/Record";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { Button, SheetActions } from "@repo/ui-native";

export default function RecordScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams();

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 p-lg pt-[80px]">
        <Record recordId={recordId} />
      </ScrollView>

      <SheetActions>
        <Button size="sm" onPress={() => router.navigate(`/${recordId as string}/edit`)}>
          Edit
        </Button>
      </SheetActions>
    </View>
  );
}
