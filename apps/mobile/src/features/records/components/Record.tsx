import Clipboard from "@react-native-clipboard/clipboard";
import { getLoginFieldSpecs, LOGIN_FIELD_GROUPS, useGetRecord } from "@repo/client";
import { DecryptedRecord } from "@repo/schema";
import { Button } from "@repo/ui-native";
import { toLocalDateStr } from "@repo/util";
import { router } from "expo-router";
import { Pen, Rocket, Wand } from "lucide-react-native";
import { Fragment, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { recordPaths } from "@/route-paths";
import LoginFieldDisplay from "./LoginFieldDisplay";

function Fallback() {
  return (
    <View>
      <Text className="text-foreground">Fallback</Text>
    </View>
  );
}

function RecordLIGroup({ children }: { children: ReactNode }) {
  return <View className="overflow-hidden rounded-lg">{children}</View>;
}

function Separator() {
  return <View className="h-px bg-border" />;
}

function VersionsItem({ record }: { record: DecryptedRecord }) {
  const iconColor = useCSSVariable("--color-foreground") as string;

  return (
    <View className="flex flex-col gap-sm rounded-lg bg-card p-md">
      <View className="flex flex-row items-center gap-2">
        <Wand size={20} color={iconColor} />
        <Text className="text-foreground">Date last used: TBA</Text>
      </View>
      <View className="flex flex-row items-center gap-2">
        <Pen size={20} color={iconColor} />
        <Text className="text-foreground">
          Date last changed: {toLocalDateStr(record.clientUpdatedAt)}
        </Text>
      </View>
      <View className="flex flex-row items-center gap-2">
        <Rocket size={20} color={iconColor} />
        <Text className="text-foreground">
          Date created: {toLocalDateStr(record.firstCreatedAt)}
        </Text>
      </View>

      <Button
        variant="glass"
        className="mt-2"
        onPress={() => router.navigate(recordPaths.recordVersions(record.recordId))}
      >
        Versions
      </Button>
    </View>
  );
}

type RecordProps = {
  recordId?: string | string[];
};

export default function Record({ recordId }: RecordProps) {
  if (!recordId || typeof recordId !== "string") return <Fallback />;

  const { record, ready } = useGetRecord(recordId);
  if (!ready || !record) return <Fallback />;

  const onCopy = (value?: string) => Clipboard.setString(typeof value === "string" ? value : "");

  const specs = getLoginFieldSpecs(record);

  return (
    <View className="gap-lg">
      {LOGIN_FIELD_GROUPS.map((group) => {
        const groupSpecs = specs.filter((spec) => spec.group === group);
        if (groupSpecs.length === 0) return null;

        return (
          <RecordLIGroup key={group}>
            {groupSpecs.map((spec, i) => (
              <Fragment key={spec.key}>
                {i > 0 && <Separator />}
                <LoginFieldDisplay spec={spec} onCopy={onCopy} />
              </Fragment>
            ))}
          </RecordLIGroup>
        );
      })}

      <VersionsItem record={record} />
    </View>
  );
}
