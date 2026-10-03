import {
  hasEditForm,
  loginFormDefaults,
  loginRecordFromForm,
  useDeleteRecord,
  useGetRecord,
  useUpdateRecord,
} from "@repo/client";
import type { DecryptedRecord, LoginFormValues } from "@repo/schema";
import { Button, RemoveDialog } from "@repo/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { TrashIcon } from "lucide-react-native";
import { Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import RecordFormSheet from "@/features/records/components/RecordFormSheet";
import { normalizeFormValues } from "@/features/records/normalize-form-values";
import { recordPaths } from "@/route-paths";

function Fallback() {
  return (
    <View>
      <Text className="text-foreground">Fallback</Text>
    </View>
  );
}

export default function EditScreen() {
  const { recordId } = useLocalSearchParams();
  if (!recordId || typeof recordId !== "string") return <Fallback />;
  return <EditRecordLoader recordId={recordId} />;
}

/** Waits for the records to load; `ready` flips mid-mount, so no hooks may follow it here. */
function EditRecordLoader({ recordId }: { recordId: string }) {
  const { record, ready } = useGetRecord(recordId);
  // No edit form for this record type yet (deep link): never save it as a login.
  if (!ready || !record || !hasEditForm(record)) return <Fallback />;
  return <EditRecord record={record} />;
}

function EditRecord({ record }: { record: DecryptedRecord }) {
  const iconDestructiveColor = useCSSVariable("--color-destructive") as string;
  const router = useRouter();
  const { recordId } = record;

  const defaultValues = loginFormDefaults(record);

  const { updateRecord, updateRecordError, updatePending } = useUpdateRecord({
    onSuccess: () => {
      // TODO: add toast
      // toast.success("Record saved");
      router.back();
    },
  });

  const onSubmit = (data: LoginFormValues) => {
    updateRecord(record, loginRecordFromForm(normalizeFormValues(data), record));
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
    <RecordFormSheet
      onSubmit={onSubmit}
      defaultValues={defaultValues}
      serverError={updateRecordError?.message}
      pending={updatePending}
      action="Save"
      title="Edit record"
      generatorPath={recordPaths.generatePassword(recordId)}
    >
      <RemoveDialog
        title="Delete record"
        description="Are you sure you want to delete this record? This action cannot be undone."
        removeTitle="Delete"
        onRemove={onDelete}
      >
        <Button variant="destructive" disabled={updatePending}>
          <TrashIcon size={18} color={iconDestructiveColor} />
          <Text className="text-destructive">Delete</Text>
        </Button>
      </RemoveDialog>
    </RecordFormSheet>
  );
}
