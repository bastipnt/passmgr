import { RECORD_TYPE_LABELS } from "@repo/client";
import { RECORD_TYPES, type RecordType } from "@repo/schema";
import { cn, SectionGroup } from "@repo/ui-native";
import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { RecordTypeTile } from "./RecordAvatar";

/** Web's `RecordTypePicker`: the first step of "New item", one row per type. */
export function RecordTypePicker({ onPick }: { onPick: (type: RecordType) => void }) {
  const muted = useCSSVariable("--color-muted-foreground") as string;

  return (
    <SectionGroup>
      {RECORD_TYPES.map((type, index) => (
        <Pressable
          key={type}
          accessibilityRole="button"
          accessibilityLabel={RECORD_TYPE_LABELS[type].type}
          accessibilityHint={RECORD_TYPE_LABELS[type].hint}
          onPress={() => onPick(type)}
          className="h-16 flex-row items-center gap-3.5 pl-5 active:bg-foreground/5"
        >
          <RecordTypeTile type={type} size="md" />
          <View
            className={cn(
              "flex-1 flex-row items-center gap-2 self-stretch pr-4",
              index > 0 && "border-foreground/8 border-t dark:border-white/8",
            )}
          >
            <View className="flex-1">
              <Text numberOfLines={1} className="font-semibold text-[16px] text-foreground">
                {RECORD_TYPE_LABELS[type].type}
              </Text>
              <Text numberOfLines={1} className="text-muted-foreground text-sm">
                {RECORD_TYPE_LABELS[type].hint}
              </Text>
            </View>
            <ChevronRight size={18} color={muted} style={{ opacity: 0.6 }} />
          </View>
        </Pressable>
      ))}
    </SectionGroup>
  );
}
