import { ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { useState } from "react";
import { useRecordSearch } from "@repo/client";
import { RecordsList } from "@/features/records/components/RecordsList";

export default function SearchScreen() {
  // Local state on purpose: the provider's own `query` is shared with the
  // records tab, which must stay unfiltered.
  const [query, setQuery] = useState("");
  const recordGroups = useRecordSearch(query);

  return (
    <>
      <Stack.Title large>Search</Stack.Title>
      <Stack.SearchBar
        placement="stacked"
        placeholder="Search"
        hideWhenScrolling={false}
        autoFocus
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
      />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="flex-grow"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="pb-lg">
          <RecordsList recordGroups={recordGroups} />
        </View>
      </ScrollView>
    </>
  );
}
