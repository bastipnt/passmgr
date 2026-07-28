import Record from "@/features/records/components/Record";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, PageActions } from "@repo/ui-native";

export default function RecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { recordId } = useLocalSearchParams();

  return (
    <View className="flex-1">
      {/* Padding lives on the content container only — on the ScrollView itself
          it would stack with the offset that clears the floating buttons. */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-4"
        contentContainerStyle={{ paddingTop: insets.top + 24 }}
      >
        <Record recordId={recordId} />
      </ScrollView>

      <PageActions>
        <Button
          hug
          variant="glass"
          size="icon-lg"
          systemImage="chevron.backward"
          accessibilityLabel="Back"
          onPress={() => router.back()}
        />

        <Button
          hug
          variant="glass-primary"
          size="lg"
          onPress={() => router.navigate(`/${recordId as string}/edit`)}
        >
          Edit
        </Button>
      </PageActions>
    </View>
  );
}
