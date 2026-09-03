import { encryptRecord, useCreateRecord } from "@repo/client";
import { CURRENT_CRYPTO_VERSION, type LoginRecord } from "@repo/schema";
import { useRouter } from "expo-router";
import RecordFormSheet from "@/features/records/components/RecordFormSheet";
import { normalizeFormValues } from "@/features/records/normalize-form-values";
import { recordPaths } from "@/route-paths";

export default function NewRecordScreen() {
  const router = useRouter();

  const { createRecord, createRecordError } = useCreateRecord({
    onSuccess: () => {
      // TODO: add toast
      // toast.success("Record created");
      router.back();
    },
  });

  const onSubmit = (data: LoginRecord) => {
    const { encryptedData, encryptionNonce } = encryptRecord({
      schemaVersion: 1,
      ...normalizeFormValues(data),
    });
    createRecord({
      recordId: crypto.randomUUID(),
      encryptedData,
      encryptionNonce,
      cryptoVersion: CURRENT_CRYPTO_VERSION,
      clientUpdatedAt: new Date().toISOString(),
    });
  };

  return (
    <RecordFormSheet
      onSubmit={onSubmit}
      serverError={createRecordError?.message}
      action="Create"
      generatorPath={recordPaths.createGeneratePassword}
    />
  );
}
