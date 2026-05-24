import { Main, ScrollView } from "tamagui";
import { RecordsList } from "@/features/records/components/RecordsList";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "@repo/ui-native";
import { StyleSheet } from "react-native";

export default function RecordsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <Main>
      <ScrollView>
        <SafeAreaView>
          <RecordsList />
        </SafeAreaView>
      </ScrollView>

      <BlurView
        intensity={80}
        tint="default"
        blurMethod="dimezisBlurViewSdk31Plus"
        style={[StyleSheet.absoluteFill, { bottom: undefined }]}
        height={insets.top}
      />
    </Main>
  );
}
