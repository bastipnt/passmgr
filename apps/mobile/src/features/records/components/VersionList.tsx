import { useRecordHistory } from "@repo/client";
import { Skeleton } from "@repo/ui-native";
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
function TimelineRail({ children, isOldest }: { children: ReactNode; isOldest: boolean }) {
  return (
    <View className="items-center self-stretch">
      <View className="rounded-full bg-primary p-2">{children}</View>
      {!isOldest && <View className="-mb-md w-0.5 flex-1 bg-border" />}
    </View>
  );
}

export default function VersionList({ recordId }: { recordId: string }) {
  const { versions, ready, error } = useRecordHistory(recordId);
  const iconColor = useCSSVariable("--color-primary-foreground") as string;
  const chevronColor = useCSSVariable("--color-muted-foreground") as string;

  if (error) {
    return <Text className="text-destructive text-sm">Could not load version history.</Text>;
  }

  if (!ready) {
    return (
      <View className="gap-md">
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} className="flex-row items-center gap-md">
            <Skeleton width={32} height={32} borderRadius={16} />
            <View className="flex-1 gap-sm">
              <Skeleton width="40%" height={14} />
              <Skeleton width="60%" height={12} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View className="gap-md">
      {versions.map((version, i) => {
        const isCurrent = i === 0;
        const isOldest = i === versions.length - 1;

        const versionName = isCurrent ? "Current version" : isOldest ? "Created" : "Modified";
        const icon = isCurrent ? (
          <ClockArrowUp size={16} color={iconColor} />
        ) : isOldest ? (
          <Sparkles size={16} color={iconColor} />
        ) : (
          <Pencil size={16} color={iconColor} />
        );

        return (
          <View key={version.version} className="flex-row gap-md">
            <TimelineRail isOldest={isOldest}>{icon}</TimelineRail>

            <Pressable
              className="flex-1 flex-row items-center gap-md rounded-lg border border-border bg-card p-md"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
              onPress={() => router.navigate(recordPaths.version(recordId, version.version))}
            >
              <View className="flex-1 gap-xs">
                <Text className="font-semibold text-foreground text-md">{versionName}</Text>
                <Text className="text-muted-foreground text-sm">
                  {toLocalDateStr(version.clientUpdatedAt)}
                </Text>
              </View>
              <ChevronRight size={16} color={chevronColor} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
