import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { WebsiteAvatar } from "../../components/WebsiteAvatar";
import { cn } from "../../lib/utils";

type RecordLIProps = {
  title: string;
  username?: string;
  websites?: { value: string }[];
  /** First row of its group: drops the hairline above it. */
  first?: boolean;
  onClick?: () => void;
};

/**
 * Full-bleed table-view row, as on web at phone width: favicon tile, title +
 * username, chevron, and a hairline inset past the avatar.
 */
export function RecordListItem({ title, username, websites, first, onClick }: RecordLIProps) {
  const chevron = useCSSVariable("--color-muted-foreground") as string;

  return (
    <Pressable
      onPress={onClick}
      accessibilityRole="button"
      className="h-16 flex-row items-center gap-3.5 pl-5 active:bg-foreground/5"
    >
      <WebsiteAvatar title={title} websites={websites} size="md" />
      <View
        className={cn(
          "flex-1 flex-row items-center gap-2 self-stretch pr-4",
          !first && "border-foreground/8 border-t dark:border-white/8",
        )}
      >
        <View className="flex-1">
          <Text numberOfLines={1} className="font-semibold text-[16px] text-foreground">
            {title}
          </Text>
          <Text numberOfLines={1} className="text-muted-foreground text-sm">
            {username || "—"}
          </Text>
        </View>
        <ChevronRight size={18} color={chevron} style={{ opacity: 0.6 }} />
      </View>
    </Pressable>
  );
}
