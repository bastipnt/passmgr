import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text } from "react-native";
import { Button, RemoveDialog, SheetActions } from "@repo/ui-native";
import LoginRecordForm, {
  LoginRecordFormHandle,
} from "@/features/records/components/LoginRecordForm";
import { useEffect, useRef } from "react";
import { encryptRecord, useDeleteRecord, useGetRecord, useUpdateRecord } from "@repo/client";
import { CURRENT_CRYPTO_VERSION, type LoginRecord } from "@repo/schema";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { isDefined, normalizeWebsiteUrl } from "@repo/util";
import { TrashIcon } from "lucide-react-native";
import { useCSSVariable } from "uniwind";

function Fallback() {
  return (
    <View>
      <Text className="text-foreground">Fallback</Text>
    </View>
  );
}

export default function EditScreen() {
  const iconDestructiveColor = useCSSVariable("--color-destructive") as string;
  const router = useRouter();

  const { recordId } = useLocalSearchParams();
  const formRef = useRef<LoginRecordFormHandle>(null);

  if (!recordId || typeof recordId !== "string") return <Fallback />;

  const { record, ready } = useGetRecord(recordId);
  if (!ready || !record) return <Fallback />;

  const defaultValues: Partial<LoginRecord> = {
    title: record.title,
    username: record.username,
    password: record.password,
    totp: record.totp,
    websites: record.websites,
    note: record.note,
    extraFields: record.extraFields,
  };

  // TODO: move into useUpdateRecord
  function normalizeFormValues(data: LoginRecord) {
    return {
      ...data,
      websites: data.websites
        ?.map(({ value, ...rest }) => ({ ...rest, value: value.trim() }))
        .filter(({ value }) => value !== "")
        .map(({ value, ...rest }) => ({ ...rest, value: normalizeWebsiteUrl(value) })),
    };
  }

  const { updateRecord, updateRecordError } = useUpdateRecord({
    onSuccess: () => {
      // TODO: add toast
      // toast.success("Record saved");
      router.back();
    },
  });

  const onSubmit = (data: LoginRecord) => {
    console.log("yay", data);

    const normalizedValues = normalizeFormValues(data);
    const { encryptedData, encryptionNonce } = encryptRecord({
      schemaVersion: record!.schemaVersion,
      ...normalizedValues,
    });
    updateRecord({
      recordId,
      encryptedData,
      encryptionNonce,
      cryptoVersion: CURRENT_CRYPTO_VERSION,
      version: record!.version,
      clientUpdatedAt: new Date().toISOString(),
    });
  };

  const { deleteRecord } = useDeleteRecord({
    onSuccess: () => {
      // TODO: add toast
      // toast.success("Record deleted");
      router.back();
    },
  });

  const onDelete = () => deleteRecord(recordId);

  // TODO: add toast
  // useEffect(() => {
  //   if (isDefined(updateRecordError)) toast.error("Error saving");
  // }, [updateRecordError]);

  return (
    <View className="flex-1">
      <KeyboardAwareScrollView
        mode="layout"
        contentContainerClassName="grow gap-md p-md pt-[80px]"
        bottomOffset={24}
      >
        <LoginRecordForm
          onSubmit={onSubmit}
          serverError={""}
          defaultValues={defaultValues}
          action="Save"
          ref={formRef}
        />

        <RemoveDialog
          title="Delete record"
          description="Are you sure you want to delete this record? This action cannot be undone."
          removeTitle="Delete"
          onRemove={onDelete}
        >
          <Button variant="destructive">
            <TrashIcon size={18} color={iconDestructiveColor} />
            <Text className="text-destructive">Delete</Text>
          </Button>
        </RemoveDialog>
      </KeyboardAwareScrollView>

      <SheetActions>
        <Button size="sm" onPress={() => formRef.current?.triggerSubmit()}>
          Save
        </Button>
      </SheetActions>
    </View>
  );
}
