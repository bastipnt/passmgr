import { Pressable, View, Text } from "react-native";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/Avatar";
import { useWebsiteAvatar } from "@repo/ui-shared";

import { cn } from "../../lib/utils";

type RecordLIProps = {
  title: string;
  username?: string;
  websites?: { value: string }[];
  active?: boolean;
  onClick?: () => void;
};

export function RecordListItem({ title, username, websites, active, onClick }: RecordLIProps) {
  const { src, status, hue } = useWebsiteAvatar({ title, websites });

  return (
    <Pressable
      onPress={onClick}
      className={cn("flex-row items-center gap-lg p-md", active ? "bg-accent" : "bg-background")}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      <Avatar size="lg">
        {status === "ok" && src ? (
          <AvatarImage src={src} />
        ) : (
          <AvatarFallback style={{ backgroundColor: `hsl(${hue}, 100%, 80%)` }}>
            <Text style={{ color: `hsl(${hue}, 80%, 20%)` }}>{title.charAt(0)}</Text>
          </AvatarFallback>
        )}
      </Avatar>
      <View className="flex-1">
        <Text className="text-md font-medium text-foreground">{title}</Text>
        <Text className="text-sm text-muted-foreground">{username ?? "-"}</Text>
      </View>
    </Pressable>
  );
}
