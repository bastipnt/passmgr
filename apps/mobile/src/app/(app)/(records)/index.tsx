import {
  SORT_LABELS,
  type SortOption,
  useGetRecords,
  useRecordSearch,
  useSortedRecords,
} from "@repo/client";
import { Stack, useRouter, useScrollToTop } from "expo-router";
import { useEffect, useRef } from "react";
import { ScrollView, View } from "react-native";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import { RecordsList } from "@/features/records/components/RecordsList";
import { useResetStackOnTabBlur } from "@/hooks/use-reset-stack-on-tab-blur";
import { recordPaths } from "@/route-paths";

const SORT_OPTIONS = Object.entries(SORT_LABELS) as [SortOption, string][];

export default function RecordsScreen() {
  const router = useRouter();
  const recordGroups = useRecordSearch("");
  const { recordsNumber } = useGetRecords();
  const { sort, handleSortChange } = useSortedRecords();
  const foregroundColor = useCSSVariable("--color-foreground") as string;
  const primaryColor = useCSSVariable("--color-primary") as string;
  const headerTitleStyle = useResolveClassNames("text-foreground");

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
      {/*
       * Native `UIBarButtonItem`s rather than views floating over the list: only
       * real bar items get the iOS 26 glass that samples the content scrolling
       * under the transparent header. The sort picker is a `UIMenu` with one
       * checked action — `multiselectable` defaults to false, so it behaves as
       * a single select.
       */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitleStyle,
          title: `${recordsNumber} Entries`,
          unstable_headerLeftItems: () => [
            {
              type: "menu",
              label: "Sort",
              accessibilityLabel: "Sort records",
              icon: { type: "sfSymbol", name: "arrow.up.arrow.down" },
              tintColor: foregroundColor,
              menu: {
                title: "Sort by",
                items: SORT_OPTIONS.map(([value, label]) => ({
                  type: "action",
                  label,
                  state: value === sort ? "on" : "off",
                  onPress: () => handleSortChange(value),
                })),
              },
            },
          ],
          unstable_headerRightItems: () => [
            {
              type: "button",
              label: "New record",
              accessibilityLabel: "New record",
              icon: { type: "sfSymbol", name: "plus" },
              tintColor: primaryColor,
              onPress: () => router.navigate(recordPaths.create),
            },
          ],
        }}
      />

      {/* `automatic` lets UIKit inset the list by the transparent header and
          drives the scroll-edge effect behind the bar items. */}
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="grow"
        contentInsetAdjustmentBehavior="automatic"
      >
        <RecordsList recordGroups={recordGroups} />
      </ScrollView>
    </View>
  );
}
