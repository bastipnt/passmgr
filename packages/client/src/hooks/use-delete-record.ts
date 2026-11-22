import { useMutation } from "@tanstack/react-query";
import { requireActive, useStore } from "../providers/StoreProvider";
import { localQueryOptions } from "../util/local-query-options";
import { useRefreshRecord } from "./use-records";

type UseDeleteRecordOpts = {
  onSuccess: () => void;
  onError?: (error: Error) => void;
};

export function useDeleteRecord({ onSuccess, onError }: UseDeleteRecordOpts) {
  const store = useStore();
  const refreshRecord = useRefreshRecord();

  const { mutate, error: mutationError } = useMutation({
    ...localQueryOptions,
    mutationFn: (recordId: string) => requireActive(store).records.delete(recordId),
    onSuccess: async (_, recordId) => {
      await refreshRecord(recordId);
      onSuccess();
    },
    onError,
  });

  return { deleteRecord: mutate, deleteRecordError: mutationError };
}
