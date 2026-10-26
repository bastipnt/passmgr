import {
  recordErrorMessage,
  recordFromForm,
  useDeleteRecord,
  useGetRecord,
  useShortcut,
  useUpdateRecord,
} from "@repo/client";
import type { RecordFormValues } from "@repo/schema";
import { toast } from "@repo/ui";
import { useLocation } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { useCopyField } from "./record-utils";

type UseRecordActionsProps = {
  recordId: string;
  actionCb?: () => void;
};

export function useRecordActions({ recordId, actionCb }: UseRecordActionsProps) {
  const { record, ready } = useGetRecord(recordId);

  const { deleteRecord } = useDeleteRecord({
    onSuccess: () => {
      toast.success("Record deleted");
      if (actionCb) actionCb();
    },
    onError: () => toast.error("The item couldn't be deleted"),
  });

  const { updateRecord, updateRecordError, updatePending } = useUpdateRecord({
    onSuccess: () => {
      if (actionCb) actionCb();
      toast.success("Record saved");
    },
    onError: (error) => toast.error(recordErrorMessage(error, "The item couldn't be saved")),
  });

  function handleSubmit(formValues: RecordFormValues) {
    // The form is the record's own type's (`RecordForm type={record.type}`).
    updateRecord(record!, recordFromForm(record!.type, formValues, record));
  }

  return {
    deleteRecord,
    handleSubmit,
    record,
    ready,
    updateRecordError,
    updatePending,
  };
}

export const RECORD_SHORTCUTS = {
  copyPassword: "$mod+Shift+c",
  copyUsername: "$mod+Shift+u",
  edit: "$mod+e",
} as const;

/**
 * Record-scoped shortcuts. Register these **once per screen** — `useRecordActions`
 * runs in several components at once, and registering there would mean the same
 * keys are claimed repeatedly with "last mounted wins" semantics.
 *
 * Suppression while a sheet is open is handled by `ShortcutLayer`, not by
 * `enabled` — `enabled` here only means "this action is impossible right now".
 */
export function useRecordShortcuts({ recordId }: { recordId: string }) {
  const { record, ready } = useGetRecord(recordId);
  const [, navigate] = useLocation();
  const copyField = useCopyField();
  // Logins and Wi-Fi networks have a password; only logins a username.
  const password =
    record?.type === "login" || record?.type === "wifi" ? record.password : undefined;
  const username = record?.type === "login" ? record.username : undefined;

  useShortcut(RECORD_SHORTCUTS.copyPassword, () => copyField(password, "Password"), {
    description: "Copy password",
    enabled: ready && !!password,
    allowInInput: true,
  });

  useShortcut(RECORD_SHORTCUTS.copyUsername, () => copyField(username, "Username"), {
    description: "Copy username",
    enabled: ready && !!username,
    allowInInput: true,
  });

  useShortcut(
    RECORD_SHORTCUTS.edit,
    () => navigate(recordPaths.editRecord(recordId), { replace: true }),
    {
      description: "Edit record",
      enabled: ready && !!record,
      allowInInput: true,
    },
  );
}
