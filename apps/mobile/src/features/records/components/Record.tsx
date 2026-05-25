import { useGetRecord } from "@repo/client";
import { ListItem, ListItemProps, Separator, Text, View, YGroup, YStack } from "tamagui";
import { Earth, Key, Mail } from "@tamagui/lucide-icons-2";
import Clipboard from "@react-native-clipboard/clipboard";
import { ReactNode } from "react";

function Fallback() {
  return (
    <View>
      <Text>Fallback</Text>
    </View>
  );
}

const HIDDEN_VALUE = "••••••••••••" as const;

type SubtitleProps = {
  value?: string | string[];
  hidden?: boolean;
};

function Subtitle({ value, hidden }: SubtitleProps) {
  if (!value) return <Text>-</Text>;
  else if (typeof value === "string") return <Text>{hidden ? HIDDEN_VALUE : value}</Text>;
  else
    return (
      <YGroup gap="$1">
        {value.map((v, i) => (
          <YGroup.Item key={`item-${v}-${i}`}>
            <Text>{v}</Text>
          </YGroup.Item>
        ))}
      </YGroup>
    );
}

type RecordLIProps = {
  icon: ListItemProps["icon"];
  title: string;
  value?: string | string[];
  variant?: "default" | "password";
};

function RecordLI({ icon, title, value, variant }: RecordLIProps) {
  const usesHiddenValue = variant === "password";

  const onCopy = () => Clipboard.setString(typeof value === "string" ? value : "");

  return (
    <ListItem
      icon={icon}
      title={title}
      subTitle={<Subtitle value={value} hidden={usesHiddenValue} />}
      onPress={onCopy}
      gap="$4"
    />
  );
}

function RecordLIGroup({ children }: { children: ReactNode }) {
  return (
    <YGroup rounded="$4" overflow="hidden">
      {children}
    </YGroup>
  );
}

type RecordProps = {
  recordId?: string | string[];
};

// TODO: style my own ListItem: https://tamagui.dev/ui/list-item#customization
export default function Record({ recordId }: RecordProps) {
  if (!recordId || typeof recordId !== "string") return <Fallback />;

  const { record, ready } = useGetRecord(recordId);
  if (!ready || !record) return <Fallback />;

  return (
    <YStack gap="$4">
      <RecordLIGroup>
        <RecordLI icon={Mail} title="Username" value={record.username} />
        <Separator />
        <RecordLI icon={Key} title="Password" value={record.password} variant="password" />
      </RecordLIGroup>

      <RecordLIGroup>
        <RecordLI icon={Earth} title="Websites" value={record.websites?.map((w) => w.value)} />
      </RecordLIGroup>
    </YStack>
  );
}
