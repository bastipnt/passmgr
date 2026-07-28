import { View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import type { SearchBarCommands } from "react-native-screens";
import { useRecordSearch } from "@repo/client";
import { Empty, EmptyDescription, EmptyHeader } from "@repo/ui-native";
import { RecordsList } from "@/features/records/components/RecordsList";
import { RecentRecords } from "@/features/search/components/RecentRecords";
import { useRecentRecords } from "@/features/search/use-recent-records";
import { useResetStackOnTabBlur } from "@/hooks/use-reset-stack-on-tab-blur";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useCSSVariable } from "uniwind";

export default function SearchScreen() {
  // Local state on purpose: the provider's own `query` is shared with the
  // records tab, which must stay unfiltered.
  const [query, setQuery] = useState("");
  const recordGroups = useRecordSearch(query);
  const { recentRecords, addRecentRecord, clearRecentRecords } = useRecentRecords();

  const hasQuery = query.trim().length > 0;
  const searchBarRef = useRef<SearchBarCommands>(null);
  const router = useRouter();
  const background = useCSSVariable("--color-background") as string;
  const foreground = useCSSVariable("--color-foreground") as string;
  const primary = useCSSVariable("--color-primary") as string;

  // `autoFocus` only fires on mount, but the tab screen stays mounted — refocus
  // every time the search tab is selected.
  useFocusEffect(
    useCallback(() => {
      const handle = setTimeout(() => searchBarRef.current?.focus(), 0);
      return () => clearTimeout(handle);
    }, []),
  );

  // Leaving the search tab discards the search entirely: the query, the native
  // search bar text and any record screen pushed on top of this one.
  useResetStackOnTabBlur(() => {
    setQuery("");
    searchBarRef.current?.clearText();
  });

  return (
    <>
      {/* `integrated` (+ toolbar integration, which `stacked` would force off) lets
          UIKit host the field in the tab bar of the `role="search"` trigger, so the
          header is left with nothing to show and is hidden below. */}
      <Stack.SearchBar
        ref={searchBarRef}
        placement="automatic"
        placeholder="Search"
        hideWhenScrolling={false}
        textColor={foreground}
        tintColor={primary}
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        // Dismissing search (the × on the right) leaves the search tab entirely.
        onCancelButtonPress={() => {
          setQuery("");
          searchBarRef.current?.clearText();
          router.navigate("/");
        }}
      />
      {/* `Stack.SearchBar` forces `headerShown: true`, and the native header does not
          follow the Uniwind theme on its own — without this it renders as a white strip.
          Must stay after the search bar: composition options merge in registration order. */}
      <Stack.Header style={{ backgroundColor: background, shadowColor: "transparent" }} />
      <KeyboardAwareScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View>
          {hasQuery ? (
            <RecordsList recordGroups={recordGroups} onSelect={addRecentRecord} />
          ) : recentRecords.length > 0 ? (
            <RecentRecords
              records={recentRecords}
              onOpen={addRecentRecord}
              onClear={clearRecentRecords}
            />
          ) : (
            <View className="p-md">
              <Empty>
                <EmptyHeader>
                  <EmptyDescription>Type to search</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </View>
          )}
        </View>
      </KeyboardAwareScrollView>
    </>
  );
}
