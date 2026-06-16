import { ListItem, Text, YGroup } from "tamagui";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/Avatar";
import { useWebsiteAvatar } from "@repo/ui-shared";

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
    <YGroup.Item>
      <ListItem
        onPress={onClick}
        bg={active ? "$accent8" : "$background"}
        icon={
          <Avatar circular>
            {status === "ok" && src && <AvatarImage src={src} />}
            {(status !== "ok" || !src) && (
              <AvatarFallback bg={`hsl(${hue}, 100%, 80%)`}>
                <Text color={`hsl(${hue}, 80%, 20%)`}>{title.charAt(0)}</Text>
              </AvatarFallback>
            )}
          </Avatar>
        }
        title={title}
        subTitle={username ?? "-"}
        size="$lg"
        gap="$lg"
      />
    </YGroup.Item>
  );
}
