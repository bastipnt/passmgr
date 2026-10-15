import {
  type FieldGroup,
  getPrimaryWebsite,
  getRecordFieldSpecs,
  previousSecretsTitle,
  RECORD_TYPE_LABELS,
  useGetRecord,
  usePreviousSecrets,
  useSortedRecords,
} from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { Section, SectionHeading } from "@repo/ui-native";
import { toLocalDateStr } from "@repo/util";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ChevronRight, ExternalLink, History, Tag } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { recordPaths } from "@/route-paths";
import { useCopyField } from "../use-copy-field";
import LoginFieldDisplay, { type OnCopy } from "./LoginFieldDisplay";
import { RecordAvatar } from "./RecordAvatar";
import { WifiQrCode } from "./WifiQrCode";

// The title is the page heading, so it isn't repeated as a field. The
// type-specific group takes its label from the record type.
const SECTIONS: { group: FieldGroup; label?: string }[] = [
  { group: "fields" },
  { group: "custom", label: "Extra fields" },
  { group: "websites", label: "Websites" },
  { group: "note", label: "Note" },
];

function Hero({ record }: { record: DecryptedRecord }) {
  const muted = useCSSVariable("--color-muted-foreground") as string;
  const website = getPrimaryWebsite(record);

  return (
    <View className="flex-row items-center gap-4 px-5 pt-2 pb-2">
      <RecordAvatar record={record} size="lg" />
      <View className="flex-1 gap-1">
        <Text
          numberOfLines={2}
          className="font-display text-[28px] text-foreground leading-[30px] tracking-[-0.6px]"
        >
          {record.title}
        </Text>
        {website ? (
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync(website.url).catch(() => {})}
            hitSlop={6}
            className="flex-row items-center gap-1.5 self-start"
          >
            <Text numberOfLines={1} className="text-muted-foreground text-sm">
              {website.host}
            </Text>
            <ExternalLink size={14} color={muted} />
          </Pressable>
        ) : (
          record.type !== "login" && (
            <Text className="text-muted-foreground text-sm">
              {RECORD_TYPE_LABELS[record.type].type}
            </Text>
          )
        )}
      </View>
    </View>
  );
}

/** Web's `RecordTags`. */
function TagsSection({ tags }: { tags: string[] }) {
  const muted = useCSSVariable("--color-muted-foreground") as string;
  const { showTag } = useSortedRecords();

  return (
    <View className="gap-2">
      <SectionHeading>Tags</SectionHeading>
      <View className="flex-row flex-wrap gap-2 px-5">
        {tags.map((tag) => (
          <Pressable
            key={tag}
            accessibilityRole="button"
            accessibilityLabel={`Show items tagged ${tag}`}
            onPress={() => {
              showTag(tag);
              router.navigate(recordPaths.index);
            }}
            className="h-8 flex-row items-center gap-1.5 rounded-full bg-foreground/8 px-3 active:bg-foreground/15 dark:bg-white/10"
          >
            <Tag size={14} color={muted} />
            <Text className="font-medium text-foreground text-sm">{tag}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function HistorySection({ record }: { record: DecryptedRecord }) {
  const muted = useCSSVariable("--color-muted-foreground") as string;
  // Versions are numbered from 1, so the latest number is the count.
  const versionCount = record.version;

  return (
    <View className="gap-2">
      <SectionHeading>History</SectionHeading>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.navigate(recordPaths.recordVersions(record.recordId))}
        className="flex-row items-center gap-3 border-foreground/10 border-y px-5 py-3 active:bg-primary/8 dark:border-white/10 dark:active:bg-foreground/5"
      >
        <View className="h-6 w-6 items-center justify-center rounded-full bg-foreground/8">
          <History size={14} color={muted} />
        </View>
        <Text className="flex-1 font-semibold text-foreground text-sm">Version history</Text>
        <Text className="text-muted-foreground text-sm" style={{ fontVariant: ["tabular-nums"] }}>
          {versionCount} {versionCount === 1 ? "version" : "versions"}
        </Text>
        <ChevronRight size={16} color={muted} />
      </Pressable>
      <Text className="px-5 text-muted-foreground text-xs">
        Created {toLocalDateStr(record.firstCreatedAt)} · Last changed{" "}
        {toLocalDateStr(record.clientUpdatedAt)}
      </Text>
    </View>
  );
}

function PreviousSecretsSection({ record, onCopy }: { record: DecryptedRecord; onCopy: OnCopy }) {
  const { previous } = usePreviousSecrets(record);
  if (previous.length === 0) return null;

  return (
    <Section title={previousSecretsTitle(record.type)}>
      {previous.map((spec) => (
        <LoginFieldDisplay key={spec.key} spec={spec} onCopy={onCopy} />
      ))}
    </Section>
  );
}

type RecordProps = {
  record: DecryptedRecord;
};

/** Record detail body: hero, field sections and history — web's `MobileRecordPage`. */
export default function Record({ record }: RecordProps) {
  const onCopy = useCopyField();
  const specs = getRecordFieldSpecs(record, { includeDerived: true });

  return (
    <View className="gap-6 pb-6">
      <Hero record={record} />

      {SECTIONS.map(({ group, label }) => {
        const groupSpecs = specs.filter((spec) => spec.group === group);
        if (groupSpecs.length === 0) return null;

        return (
          <Section key={group} title={label ?? RECORD_TYPE_LABELS[record.type].fields}>
            {groupSpecs.map((spec) => (
              <LoginFieldDisplay key={spec.key} spec={spec} onCopy={onCopy} />
            ))}
          </Section>
        );
      })}

      {record.type === "wifi" && <WifiQrCode record={record} />}

      {record.tags && record.tags.length > 0 && <TagsSection tags={record.tags} />}

      <PreviousSecretsSection record={record} onCopy={onCopy} />

      <HistorySection record={record} />
    </View>
  );
}

/**
 * Loads the record behind a `recordId` route param. `record` stays undefined
 * until the vault is `ready`, and after that when no such record exists.
 */
export function useRecordParam(recordId: string | string[] | undefined) {
  const id = typeof recordId === "string" ? recordId : "";
  const { record, ready } = useGetRecord(id);
  return { record: ready ? record : undefined, ready };
}
