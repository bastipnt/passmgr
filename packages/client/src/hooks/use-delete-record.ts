import { useMutation } from "@tanstack/react-query";
import { requireActive, useStore } from "../providers/StoreProvider";
import { useRefreshRecord } from "./use-records";

type UseDeleteRecordOpts = {
  onSuccess: () => void;
};

export function useDeleteRecord({ onSuccess }: UseDeleteRecordOpts) {
  const store = useStore();
  const refreshRecord = useRefreshRecord();

  const { mutate, error: mutationError } = useMutation({
    // Local only (ADR 0001 D1): never paused while the browser reports offline.
    networkMode: "always",
    mutationFn: (recordId: string) => requireActive(store).records.delete(recordId),
    onSuccess: async (_, recordId) => {
      await refreshRecord(recordId);
      onSuccess();
    },
  });

  return { deleteRecord: mutate, deleteRecordError: mutationError };
}
