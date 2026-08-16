import Clipboard from "@react-native-clipboard/clipboard";
import { useGetRecord } from "@repo/client";
import { RecordDetailsItem } from "@repo/ui-native";
import { isDefined } from "@repo/util";
import { Earth, Key, Lock, Mail, NotebookPen, NotebookText } from "lucide-react-native";
import { Fragment, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import TotpField from "./TotpField";

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

type RecordProps = {
  recordId?: string | string[];
};

export default function Record({ recordId }: RecordProps) {
  const iconColor = useCSSVariable("--color-muted-foreground") as string;

  if (!recordId || typeof recordId !== "string") return <Fallback />;

  const { record, ready } = useGetRecord(recordId);
  if (!ready || !record) return <Fallback />;

  const onCopy = (value?: string) => Clipboard.setString(typeof value === "string" ? value : "");

  return (
    <View className="gap-lg">
      <RecordLIGroup>
        <RecordDetailsItem
          icon={<Mail size={20} color={iconColor} />}
          title="Username"
          value={record.username}
          onCopy={() => onCopy(record.username)}
        />
        <Separator />
        <RecordDetailsItem
          icon={<Key size={20} color={iconColor} />}
          title="Password"
          value={record.password}
          variant="password"
          onCopy={() => onCopy(record.password)}
        />
        {isDefined(record.totp) && (
          <>
            <Separator />
            <TotpField onCopy={onCopy} totpData={record.totp} />
          </>
        )}
      </RecordLIGroup>

      {isDefined(record.websites) && record.websites.length > 0 && (
        <RecordLIGroup>
          <RecordDetailsItem
            icon={<Earth size={20} color={iconColor} />}
            title="Websites"
            value={record.websites?.map((w) => w.value)}
            variant="websites"
          />
        </RecordLIGroup>
      )}

      {isDefined(record.note) && record.note !== "" && (
        <RecordLIGroup>
          <RecordDetailsItem
            title="Notes"
            value={record.note}
            icon={<NotebookPen size={20} color={iconColor} />}
            onCopy={() => onCopy(record.note)}
          />
        </RecordLIGroup>
      )}

      {isDefined(record.extraFields) && record.extraFields.length > 0 && (
        <RecordLIGroup>
          {record.extraFields.map((extraField, i) => (
            <Fragment key={i}>
              <RecordDetailsItem
                title={extraField.title}
                value={extraField.value}
                onCopy={() => onCopy(extraField.value)}
                icon={
                  extraField.type === "secret" ? (
                    <Lock size={20} color={iconColor} />
                  ) : (
                    <NotebookText size={20} color={iconColor} />
                  )
                }
                variant={extraField.type === "secret" ? "hidden" : "default"}
              />
              {i < record.extraFields!.length - 1 && <Separator />}
            </Fragment>
          ))}
        </RecordLIGroup>
      )}
    </View>
  );
}
