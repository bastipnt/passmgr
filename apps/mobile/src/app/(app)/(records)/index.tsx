import { ScrollView, StyleSheet, View } from "react-native";
import { RecordsList } from "@/features/records/components/RecordsList";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "@repo/ui-native";
import { useRecordSearch } from "@repo/client";
import { useScrollToTop } from "expo-router";
import { useRef } from "react";
import { useResetStackOnTabBlur } from "@/hooks/use-reset-stack-on-tab-blur";

export default function RecordsScreen() {
  const insets = useSafeAreaInsets();
  const recordGroups = useRecordSearch("");

  // Tapping the already-active Home tab scrolls back to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  useResetStackOnTabBlur();

  return (
    <View className="flex-1 bg-background">
      <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName="flex-grow">
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
