import { getRecordSubtitle, getRecordWebsites, type RecordGroup } from "@repo/client";
import { RecordGroupLabel, RecordListItem } from "@repo/ui-native";
import { useRouter } from "expo-router";
import { Fragment } from "react";
import { Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { recordPaths } from "@/route-paths";
import { StickyLabel, StickyList } from "./StickyLabels";

type RecordsListProps = {
  recordGroups: RecordGroup[];
  /** Fires before navigation when a record is tapped (search tracks recents). */
  onSelect?: (recordId: string) => void;
  /**
   * The screen's `useScrollTitle().scrollY`: pins the group labels under the
   * header while their rows scroll by. Without it the labels scroll along.
   */
  scrollY?: SharedValue<number>;
};

export function RecordsList({ recordGroups, onSelect, scrollY }: RecordsListProps) {
  const router = useRouter();
  let labelIndex = 0;

  // Labels and rows are rendered flat (fragments add no views): `StickyList`
  // layers its frost between them, which RN's zIndex only does for siblings.
  const items = recordGroups.map((recordGroup) => {
    const label = recordGroup.label ? (
      scrollY ? (
        <StickyLabel index={labelIndex++}>
          <RecordGroupLabel text={recordGroup.label} />
        </StickyLabel>
      ) : (
        <RecordGroupLabel text={recordGroup.label} />
      )
    ) : null;

    return (
      <Fragment key={recordGroup.label ?? "all"}>
        {label}
        {recordGroup.records.map((record, index) => (
          <RecordListItem
            key={record.recordId}
            first={index === 0}
            title={record.title}
            username={getRecordSubtitle(record)}
            websites={getRecordWebsites(record)}
            // [recordId] lives in the (records,search) group, so the same href
            // resolves inside whichever tab is currently active.
            onClick={() => {
              onSelect?.(record.recordId);
              router.navigate(recordPaths.record(record.recordId));
            }}
          />
        ))}
      </Fragment>
    );
  });

  if (!scrollY) return <View>{items}</View>;

  return (
    <StickyList scrollY={scrollY} count={labelIndex}>
      {items}
    </StickyList>
  );
}

/** Web's empty vault: three dashed ghost rows fading out, then a hint. */
export function EmptyRecordList() {
  return (
    <View className="gap-3 px-5 pt-4">
      {[1, 0.7, 0.4].map((opacity) => (
        <View
          key={opacity}
          style={{ opacity }}
          className="h-16 flex-row items-center gap-3.5 rounded-2xl border border-foreground/12 border-dashed px-3"
        >
          <View className="h-[42px] w-[42px] rounded-xl bg-foreground/5" />
          <View className="flex-1 gap-2">
            <View className="h-2.5 w-1/2 rounded-full bg-foreground/8" />
            <View className="h-2 w-1/3 rounded-full bg-foreground/5" />
          </View>
        </View>
      ))}
      <Text className="pt-3 text-center text-muted-foreground text-sm">
        No logins yet. Tap + to add your first one.
      </Text>
    </View>
  );
}
