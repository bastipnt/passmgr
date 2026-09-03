import { useRecordSearch, useSortedRecords } from "@repo/client";
import { Button, PageActions } from "@repo/ui-native";
import { useRouter, useScrollToTop } from "expo-router";
import { useEffect, useRef } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RecordsList } from "@/features/records/components/RecordsList";
import { RecordsSortMenu } from "@/features/records/components/RecordsSortMenu";
import { useResetStackOnTabBlur } from "@/hooks/use-reset-stack-on-tab-blur";
import { recordPaths } from "@/route-paths";

export default function RecordsScreen() {
  const router = useRouter();
  const recordGroups = useRecordSearch("");
  const { sort } = useSortedRecords();

  // Tapping the already-active Home tab scrolls back to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  useResetStackOnTabBlur();

  // A new sort reshuffles the whole list, so the old scroll offset points at
  // unrelated records — go back to the top. Skips the initial render.
  const prevSortRef = useRef(sort);
  useEffect(() => {
    if (prevSortRef.current === sort) return;
    prevSortRef.current = sort;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [sort]);

  return (
    <View className="flex-1 bg-background">
      {/* Padding on the content container clears the floating sort button —
          the safe area inset itself still comes from the SafeAreaView. */}
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="grow"
        contentContainerStyle={{ paddingTop: 76 }}
      >
        <SafeAreaView>
          <RecordsList recordGroups={recordGroups} />
        </SafeAreaView>
      </ScrollView>

      <PageActions>
        <RecordsSortMenu />

        <Button
          hug
          variant="glass"
          size="icon-lg"
          systemImage="plus"
          accessibilityLabel="New record"
          onPress={() => router.navigate(recordPaths.create)}
        />
      </PageActions>
    </View>
  );
}
