import {
  CATEGORIES,
  categoryLabel,
  emptyCategoryHint,
  listTitle,
  SORT_LABELS,
  type SortOption,
  useGetRecords,
  useRecordSearch,
  useSortedRecords,
  useVaults,
} from "@repo/client";
import { Screen } from "@repo/ui-native";
import { Stack, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import { EmptyRecordList, RecordsList } from "@/features/records/components/RecordsList";
import { useSyncHeaderItem } from "@/features/records/use-sync-header-item";
import { useResetStackOnTabBlur } from "@/hooks/use-reset-stack-on-tab-blur";
import { useScrollTitle } from "@/hooks/use-scroll-title";
import { recordPaths } from "@/route-paths";

const SORT_OPTIONS = Object.entries(SORT_LABELS) as [SortOption, string][];

/** Scroll distance after which the page title has left and the bar shows it. */
const TITLE_IN_BAR_OFFSET = 48;

export default function RecordsScreen() {
  const router = useRouter();
  const { recordsNumber, ready } = useGetRecords();
  const {
    sort,
    handleSortChange,
    categoryFilter,
    setCategoryFilter,
    vaultFilter,
    setVaultFilter,
    tagFilters,
    toggleTag,
    clearTags,
    tags,
  } = useSortedRecords();
  const { vaults, getVault, hasSeveralVaults } = useVaults();
  const recordGroups = useRecordSearch("", {
    category: categoryFilter,
    vault: vaultFilter,
    tags: tagFilters,
  });
  const shownCount = recordGroups.reduce((count, group) => count + group.records.length, 0);
  const shownVault = vaultFilter === "all" ? undefined : getVault(vaultFilter);
  const title = listTitle({ categoryFilter, tagFilters, searching: false, vault: shownVault });
  const foregroundColor = useCSSVariable("--color-foreground") as string;
  const primaryColor = useCSSVariable("--color-primary") as string;
  const headerTitleStyle = useResolveClassNames("font-display-bold text-foreground");
  const syncItem = useSyncHeaderItem();

  // Also scrolls back to the top when the already-active Home tab is tapped.
  const { scrollProps, scrollY, titleInBar, scrollToTop, contentTopPadding, restAnchor } =
    useScrollTitle(TITLE_IN_BAR_OFFSET);
  useResetStackOnTabBlur();

  // A new sort or filter reshuffles the whole list, so the old scroll offset
  // points at unrelated records — go back to the top. Skips the initial render.
  const list = `${sort}:${categoryFilter}:${vaultFilter}:${tagFilters.join(",")}`;
  const prevListRef = useRef(list);
  useEffect(() => {
    if (prevListRef.current === list) return;
    prevListRef.current = list;
    scrollToTop();
  }, [list, scrollToTop]);

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
          title: titleInBar ? title : "",
          unstable_headerLeftItems: () => [
            {
              type: "menu",
              label: "Sort and filter",
              accessibilityLabel: "Sort and filter records",
              icon: {
                type: "sfSymbol",
                // Filled while the list is narrowed.
                name:
                  categoryFilter === "all" && vaultFilter === "all" && tagFilters.length === 0
                    ? "line.3.horizontal.decrease.circle"
                    : "line.3.horizontal.decrease.circle.fill",
              },
              tintColor: foregroundColor,
              menu: {
                items: [
                  // One vault: nothing to pick between, the list shows it all.
                  ...(hasSeveralVaults
                    ? [
                        {
                          type: "submenu" as const,
                          label: "Vault",
                          inline: true,
                          items: [
                            { value: "all", label: "All vaults" },
                            ...vaults.map((vault) => ({ value: vault.vaultId, label: vault.name })),
                          ].map(({ value, label }) => ({
                            type: "action" as const,
                            label,
                            state: value === vaultFilter ? ("on" as const) : ("off" as const),
                            onPress: () => setVaultFilter(value),
                          })),
                        },
                      ]
                    : []),
                  {
                    type: "submenu",
                    label: "Sort by",
                    inline: true,
                    items: SORT_OPTIONS.map(([value, label]) => ({
                      type: "action",
                      label,
                      state: value === sort ? "on" : "off",
                      onPress: () => handleSortChange(value),
                    })),
                  },
                  {
                    type: "submenu",
                    label: "Show",
                    inline: true,
                    items: CATEGORIES.map((category) => ({
                      type: "action",
                      label: categoryLabel(category),
                      state: category === categoryFilter ? "on" : "off",
                      onPress: () => setCategoryFilter(category),
                    })),
                  },
                  // A submenu of its own: there can be many.
                  ...(tags.length > 0
                    ? [
                        {
                          type: "submenu" as const,
                          label: tagFilters.length === 0 ? "Tag" : `Tag: ${tagFilters.join(", ")}`,
                          items: [
                            {
                              type: "action" as const,
                              label: "All tags",
                              state: tagFilters.length === 0 ? ("on" as const) : ("off" as const),
                              onPress: clearTags,
                            },
                            ...tags.map(({ tag, count }) => ({
                              type: "action" as const,
                              label: `${tag} (${count})`,
                              state: tagFilters.includes(tag) ? ("on" as const) : ("off" as const),
                              onPress: () => toggleTag(tag),
                            })),
                          ],
                        },
                      ]
                    : []),
                ],
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
            syncItem,
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
            {title}
          </Text>
          {shownCount > 0 && (
            <Text
              className="font-medium text-[18px] text-muted-foreground"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {shownCount}
            </Text>
          )}
        </View>
        {shownCount > 0 ? (
          <RecordsList
            recordGroups={recordGroups}
            scrollY={scrollY}
            // Rows name their vault where the list mixes several.
            showVault={hasSeveralVaults && !shownVault}
          />
        ) : ready ? (
          <EmptyRecordList
            hint={recordsNumber > 0 ? emptyCategoryHint(categoryFilter, tagFilters) : undefined}
          />
        ) : null}
      </Animated.ScrollView>
    </Screen>
  );
}
