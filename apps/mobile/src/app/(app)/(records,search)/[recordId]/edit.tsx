import {
  RECORD_TYPE_LABELS,
  recordErrorMessage,
  recordFormDefaults,
  recordFromForm,
  useDeleteRecord,
  useGetRecord,
  useUpdateRecord,
} from "@repo/client";
import type { DecryptedRecord, RecordFormValues } from "@repo/schema";
import { Button, RemoveDialog, toast } from "@repo/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { TrashIcon } from "lucide-react-native";
import { Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import RecordFormSheet from "@/features/records/components/RecordFormSheet";
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
  if (!ready || !record) return <Fallback />;
  return <EditRecord record={record} />;
}

function EditRecord({ record }: { record: DecryptedRecord }) {
  const iconDestructiveColor = useCSSVariable("--color-destructive") as string;
  const router = useRouter();
  const { recordId } = record;

  const defaultValues = recordFormDefaults(record);

  const { updateRecord, updateRecordError, updatePending } = useUpdateRecord({
    onSuccess: () => {
      toast.success("Record saved");
      router.back();
    },
    onError: (error) => toast.error(recordErrorMessage(error, "The item couldn't be saved")),
  });

  const onSubmit = (data: RecordFormValues) => {
    updateRecord(record, recordFromForm(record.type, data, record));
  };

  const { deleteRecord } = useDeleteRecord({
    onSuccess: () => {
      toast.success("Record deleted");
      router.back();
    },
    onError: () => toast.error("The item couldn't be deleted"),
  });

  const onDelete = () => deleteRecord(recordId);

  return (
    <RecordFormSheet
      type={record.type}
      onSubmit={onSubmit}
      defaultValues={defaultValues}
      serverError={updateRecordError?.message}
      pending={updatePending}
      action="Save"
      title={`Edit ${RECORD_TYPE_LABELS[record.type].noun}`}
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
