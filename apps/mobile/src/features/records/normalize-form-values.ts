import type { LoginRecord } from "@repo/schema";
import { normalizeWebsiteUrl } from "@repo/util";

// TODO: move into useUpdateRecord / useCreateRecord
/** Drops blank website rows and normalizes the remaining URLs. */
export function normalizeFormValues(data: LoginRecord): LoginRecord {
  return {
    ...data,
    websites: data.websites
      ?.map(({ value, ...rest }) => ({ ...rest, value: value.trim() }))
      .filter(({ value }) => value !== "")
      .map(({ value, ...rest }) => ({ ...rest, value: normalizeWebsiteUrl(value) })),
  };
}
