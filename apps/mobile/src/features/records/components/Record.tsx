import { useGetRecord } from "@repo/client";
import { ScrollView, Separator, Text, View, YGroup, YStack } from "tamagui";
import { Earth, Key, Lock, Mail, NotebookPen, NotebookText } from "@tamagui/lucide-icons-2";
import { Fragment, ReactNode } from "react";
import { RecordDetailsItem } from "@repo/ui-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { isDefined } from "@repo/util";

function Fallback() {
  return (
    <View>
      <Text>Fallback</Text>
    </View>
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

// TODO: fix styling, add missing fields
export default function Record({ recordId }: RecordProps) {
  if (!recordId || typeof recordId !== "string") return <Fallback />;

  const { record, ready } = useGetRecord(recordId);
  if (!ready || !record) return <Fallback />;

  const onCopy = (value?: string) => Clipboard.setString(typeof value === "string" ? value : "");

  return (
    <ScrollView>
      <YStack gap="$4">
        <RecordLIGroup>
          <RecordDetailsItem
            icon={<Mail />}
            title="Username"
            value={record.username}
            onCopy={() => onCopy(record.username)}
          />
          <Separator />
          <RecordDetailsItem
            icon={<Key />}
            title="Password"
            value={record.password}
            variant="password"
            onCopy={() => onCopy(record.password)}
          />
          {/* {isDefined(record.totp) && (
          <>
            <Separator />

            <TotpField onCopy={onCopy} totpData={record.totp} />
          </>
        )} */}
        </RecordLIGroup>

        {isDefined(record.websites) && record.websites.length > 0 && (
          <RecordLIGroup>
            <RecordDetailsItem
              icon={<Earth />}
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
              icon={<NotebookPen />}
              variant="noAction"
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
                  // onClick={({ type }) =>
                  //   type === "copy" && onCopy(extraField.value, extraField.title)
                  // }
                  icon={extraField.type === "secret" ? <Lock /> : <NotebookText />}
                  variant={extraField.type === "secret" ? "hidden" : "default"}
                />
                {i < record.extraFields!.length - 1 && <Separator />}
              </Fragment>
            ))}
          </RecordLIGroup>
        )}
      </YStack>
    </ScrollView>
  );
}
