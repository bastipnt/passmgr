import {
  SORT_LABELS,
  type SortOption,
  useGetRecords,
  useRecordSearch,
  useSortedRecords,
} from "@repo/client";
import { Screen } from "@repo/ui-native";
import { Stack, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import { EmptyRecordList, RecordsList } from "@/features/records/components/RecordsList";
import { useResetStackOnTabBlur } from "@/hooks/use-reset-stack-on-tab-blur";
import { useScrollTitle } from "@/hooks/use-scroll-title";
import { recordPaths } from "@/route-paths";

const SORT_OPTIONS = Object.entries(SORT_LABELS) as [SortOption, string][];

/** Scroll distance after which the page title has left and the bar shows it. */
const TITLE_IN_BAR_OFFSET = 48;

export default function RecordsScreen() {
  const router = useRouter();
  const recordGroups = useRecordSearch("");
  const { recordsNumber, ready } = useGetRecords();
  const { sort, handleSortChange } = useSortedRecords();
  const foregroundColor = useCSSVariable("--color-foreground") as string;
  const primaryColor = useCSSVariable("--color-primary") as string;
  const headerTitleStyle = useResolveClassNames("font-display-bold text-foreground");

  // Also scrolls back to the top when the already-active Home tab is tapped.
  const { scrollProps, scrollY, titleInBar, scrollToTop, contentTopPadding, restAnchor } =
    useScrollTitle(TITLE_IN_BAR_OFFSET);
  useResetStackOnTabBlur();

  // A new sort reshuffles the whole list, so the old scroll offset points at
  // unrelated records — go back to the top. Skips the initial render.
  const prevSortRef = useRef(sort);
  useEffect(() => {
    if (prevSortRef.current === sort) return;
    prevSortRef.current = sort;
    scrollToTop();
  }, [sort, scrollToTop]);

  return (
    <Screen>
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
          // Web's collapsing page title: the big one scrolls away with the
          // list, then the bar picks it up between the sort and add buttons.
          title: titleInBar ? "Logins" : "",
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
      <Animated.ScrollView
        {...scrollProps}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingTop: contentTopPadding, paddingBottom: 24 }}
      >
        {restAnchor}
        <View className="flex-row items-baseline gap-2.5 px-5 pt-1">
          <Text
            accessibilityRole="header"
            className="font-display text-[34px] text-foreground tracking-[-1px]"
          >
            Logins
          </Text>
          {recordsNumber > 0 && (
            <Text
              className="font-medium text-[18px] text-muted-foreground"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {recordsNumber}
            </Text>
          )}
        </View>
        {recordsNumber > 0 ? (
          <RecordsList recordGroups={recordGroups} scrollY={scrollY} />
        ) : ready ? (
          <EmptyRecordList />
        ) : null}
      </Animated.ScrollView>
    </Screen>
  );
}
