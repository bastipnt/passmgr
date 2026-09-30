import { describeVersionChanges, useRecordHistory, type VersionChange } from "@repo/client";
import { Badge, cn, Skeleton } from "@repo/ui-native";
import { toLocalDateStr } from "@repo/util";
import { router } from "expo-router";
import { ChevronRight, ClockArrowUp, Pencil, Sparkles } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { recordPaths } from "@/route-paths";

/**
 * The timeline rail: an icon puck with a connector running down to the next
 * entry. `isOldest` ends the line — the record's creation is the last stop.
 */
function TimelineRail({
  children,
  isCurrent,
  isOldest,
}: {
  children: ReactNode;
  isCurrent: boolean;
  isOldest: boolean;
}) {
  return (
    <View className="items-center self-stretch">
      <View
        className={cn(
          "h-9 w-9 items-center justify-center rounded-full",
          isCurrent
            ? "bg-primary"
            : "border border-foreground/12 bg-white/70 dark:border-white/14 dark:bg-white/5",
        )}
      >
        {children}
      </View>
      {!isOldest && <View className="-mb-3 w-px flex-1 bg-foreground/12 dark:bg-white/12" />}
    </View>
  );
}

const CHANGE_BADGE: Record<VersionChange["status"], "warning" | "success" | "destructive"> = {
  edited: "warning",
  added: "success",
  removed: "destructive",
};

export default function VersionList({ recordId }: { recordId: string }) {
  const { versions, ready, error } = useRecordHistory(recordId);
  const [onPrimary, muted] = useCSSVariable([
    "--color-primary-foreground",
    "--color-muted-foreground",
  ]) as string[];

  if (error) {
    return <Text className="text-destructive text-sm">Could not load version history.</Text>;
  }

  if (!ready) {
    return (
      <View className="gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} className="flex-row items-center gap-3">
            <Skeleton width={36} height={36} borderRadius={18} />
            <View className="flex-1 gap-2">
              <Skeleton width="40%" height={14} />
              <Skeleton width="60%" height={12} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View className="gap-3">
      {versions.map((version, i) => {
        const isCurrent = i === 0;
        const isOldest = i === versions.length - 1;
        const changes = describeVersionChanges(version, versions[i + 1]);

        const versionName = isCurrent ? "Current version" : isOldest ? "Created" : "Modified";
        const iconColor = isCurrent ? onPrimary : muted;
        const icon = isCurrent ? (
          <ClockArrowUp size={16} color={iconColor} />
        ) : isOldest ? (
          <Sparkles size={16} color={iconColor} />
        ) : (
          <Pencil size={16} color={iconColor} />
        );

        return (
          <View key={version.version} className="flex-row gap-3">
            <TimelineRail isCurrent={isCurrent} isOldest={isOldest}>
              {icon}
            </TimelineRail>

            {/* The first version has nothing earlier to diff against. */}
            <Pressable
              className={cn(
                "flex-1 flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 active:opacity-70",
                isCurrent
                  ? "border-primary/45 bg-primary/10"
                  : "border-foreground/10 bg-white/60 dark:border-white/10 dark:bg-white/3",
              )}
              disabled={isOldest}
              onPress={() => router.navigate(recordPaths.version(recordId, version.version))}
            >
              <View className="flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                  <Text className="font-semibold text-[15px] text-foreground">{versionName}</Text>
                  {isCurrent && (
                    <Badge variant="secondary" className="h-5">
                      <Text className="font-semibold text-[10px] text-secondary-foreground tracking-[1px]">
                        NOW
                      </Text>
                    </Badge>
                  )}
                </View>
                <Text className="text-muted-foreground text-sm">
                  {toLocalDateStr(version.clientUpdatedAt)}
                </Text>
                {changes.length > 0 && (
                  <View accessibilityLabel="Changes" className="mt-1.5 flex-row flex-wrap gap-1.5">
                    {changes.map((change) => (
                      <Badge key={change.key} variant={CHANGE_BADGE[change.status]}>
                        {change.label}
                      </Badge>
                    ))}
                  </View>
                )}
              </View>
              {!isOldest && <ChevronRight size={16} color={muted} />}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
