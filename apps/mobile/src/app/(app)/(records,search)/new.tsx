import { loginRecordFromForm, useCreateRecord } from "@repo/client";
import type { LoginFormValues } from "@repo/schema";
import { useRouter } from "expo-router";
import RecordFormSheet from "@/features/records/components/RecordFormSheet";
import { normalizeFormValues } from "@/features/records/normalize-form-values";
import { recordPaths } from "@/route-paths";

export default function NewRecordScreen() {
  const router = useRouter();

  const { createRecord, createRecordError, createPending } = useCreateRecord({
    onSuccess: () => {
      // TODO: add toast
      // toast.success("Record created");
      router.back();
    },
  });

  const onSubmit = (data: LoginFormValues) => {
    createRecord(loginRecordFromForm(normalizeFormValues(data)));
  };

  return (
    <RecordFormSheet
      onSubmit={onSubmit}
      serverError={createRecordError?.message}
      pending={createPending}
      action="Create"
      title="New record"
      generatorPath={recordPaths.createGeneratePassword}
    />
  );
}
