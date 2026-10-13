import type { DecryptedRecord } from "@repo/schema";
import { recordDataOf } from "../util/decrypt-record";
import { useUpdateRecord } from "./use-update-record";

type UseToggleFavoriteOpts = {
  onError?: (error: Error) => void;
};

/**
 * Star or unstar a record. `favorite` lives in the encrypted payload, so a
 * toggle is a new version like any edit (synced, in the history, shared with
 * every member of the vault). Unstarring drops the key rather than storing false.
 */
export function useToggleFavorite({ onError }: UseToggleFavoriteOpts = {}) {
  const { updateRecord, updatePending } = useUpdateRecord({ onSuccess: () => {}, onError });

  function toggleFavorite(record: DecryptedRecord) {
    const { favorite: _favorite, ...data } = recordDataOf(record);
    updateRecord(record, record.favorite ? data : { ...data, favorite: true });
  }

  return { toggleFavorite, togglePending: updatePending };
}
