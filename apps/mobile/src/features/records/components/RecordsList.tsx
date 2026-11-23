import { getRecordSubtitle, getRecordWebsites, type RecordGroup, useVaults } from "@repo/client";
import { RecordGroupLabel, RecordListItem } from "@repo/ui-native";
import { useRouter } from "expo-router";
import { Fragment } from "react";
import { Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { recordPaths } from "@/route-paths";
import { RecordAvatar } from "./RecordAvatar";
import { StickyList, type StickySection } from "./StickyLabels";

type RecordsListProps = {
  recordGroups: RecordGroup[];
  /** Fires before navigation when a record is tapped (search tracks recents). */
  onSelect?: (recordId: string) => void;
  /**
   * The screen's `useScrollTitle().scrollY`: pins the group labels under the
   * header while their rows scroll by. Without it the labels scroll along.
   */
  scrollY?: SharedValue<number>;
  /** Name each record's vault before its subtitle (a list that mixes vaults). */
  showVault?: boolean;
};

export function RecordsList({ recordGroups, onSelect, scrollY, showVault }: RecordsListProps) {
  const router = useRouter();
  const { getVault } = useVaults();
  const subtitle = (record: RecordGroup["records"][number]) => {
    const text = getRecordSubtitle(record);
    const vault = showVault ? getVault(record.vaultId) : undefined;
    if (!vault) return text;
    return text ? `${vault.name} · ${text}` : vault.name;
  };
  const sections: StickySection[] = recordGroups.map((recordGroup) => ({
    key: recordGroup.label ?? "all",
    label: recordGroup.label ? <RecordGroupLabel text={recordGroup.label} /> : undefined,
    rows: recordGroup.records.map((record, index) => (
      <RecordListItem
        key={record.recordId}
        first={index === 0}
        title={record.title}
        favorite={record.favorite}
        username={subtitle(record)}
        websites={getRecordWebsites(record)}
        avatar={record.type === "login" ? undefined : <RecordAvatar record={record} size="md" />}
        // [recordId] lives in the (records,search) group, so the same href
        // resolves inside whichever tab is currently active.
        onClick={() => {
          onSelect?.(record.recordId);
          router.navigate(recordPaths.record(record.recordId));
        }}
      />
    )),
  }));

  if (scrollY) return <StickyList scrollY={scrollY} sections={sections} />;

  return (
    <View>
      {sections.map(({ key, label, rows }) => (
        <Fragment key={key}>
          {label}
          {rows}
        </Fragment>
      ))}
    </View>
  );
}

/** Web's empty vault: three dashed ghost rows fading out, then a hint. */
export function EmptyRecordList({ hint = "Nothing here yet. Tap + to add your first item." }) {
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
      <Text className="pt-3 text-center text-muted-foreground text-sm">{hint}</Text>
    </View>
  );
}
